import json
import sys
import unittest
import threading
from http.server import ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import thought_tasks as tasks
import server


class ThoughtTasksTest(unittest.TestCase):
    def setUp(self):
        self.me = {'id':'me', 'author':'我', 'body':'我支持 AI 做基础反馈，但最终分数必须由教师决定。'}
        self.other = {'id':'other', 'author':'材料作者', 'body':'我也关心反馈效率，但自动决定最终分数会忽视学生的独特表达。'}
        self.companion = {'id':'companion', 'author':'同伴', 'body':'教师批改压力很大，工具可以节省检查错别字的时间。'}

    def test_relation_distinguishes_conclusion_from_conditions_and_checks_both_quotes(self):
        data,_ = tasks.prepare_analysis({'me':self.me,'candidates':[self.other]})
        own={'title':'基础反馈与最终评分分开','claim':self.me['body'],'conditions':'教师决定最终分数','quote':'最终分数必须由教师决定'}
        candidate={'id':'other','title':'保留独特表达','claim':self.other['body'],'conditions':'反对自动决定最终分数','quote':'自动决定最终分数会忽视学生的独特表达','relation':'similar','basis':'same_conclusion','reason':'都保留教师评分，一方关注分工，另一方关注表达。','myQuote':'最终分数必须由教师决定'}
        raw={'me':own,'candidates':[candidate]}
        self.assertEqual(tasks.validate_analysis(json.dumps(raw),data)['candidates'][0]['basis'],'same_conclusion')
        candidate['myQuote']='我反对一切 AI'
        with self.assertRaises(ValueError):tasks.validate_analysis(json.dumps(raw),data)

    def test_unknown_is_not_forced_into_an_opposing_camp(self):
        data,_=tasks.prepare_analysis({'me':self.me,'candidates':[self.other]})
        item={'id':'other','title':'尚待澄清','claim':'关注反馈效率','conditions':'具体方案未说明','quote':'我也关心反馈效率','relation':'unknown','basis':'insufficient','reason':'具体分工没有说明','myQuote':'我支持 AI 做基础反馈'}
        raw={'me':{'title':'反馈','claim':'支持基础反馈','conditions':'教师评分','quote':'最终分数必须由教师决定'},'candidates':[item]}
        self.assertEqual(tasks.validate_analysis(json.dumps(raw),data)['candidates'][0]['relation'],'unknown')
        item['id']='invented'
        with self.assertRaises(ValueError):tasks.validate_analysis(json.dumps(raw),data)

    def test_numbered_passages_preserve_evidence_without_model_retyping(self):
        original='第一句。\n第二句包括公式 0.5 / 3.14。\n最后一个条件。'
        pieces=tasks.passages(original)
        self.assertEqual(tasks.evidence({'quoteId':'p2'},original),pieces[1]['text'])
        self.assertIn('0.5 / 3.14',pieces[1]['text'])
        with self.assertRaises(ValueError):tasks.evidence({'quoteId':'p9999'},original)
        _,messages=tasks.prepare_analysis({'me':self.me,'candidates':[self.other]})
        self.assertIn('"quoteId"',messages[1]['content'])
        self.assertIn('"passages"',messages[1]['content'])

    def summary_data(self):
        return tasks.prepare_summary({'messages':[{'id':'a','who':'A','kind':'mine','text':'我接受基础反馈，最终评分交给教师。'}, {'id':'b','who':'B','kind':'other','text':'我也接受基础反馈，但仍担心表达趋同。'}]})[0]

    def test_summary_requires_real_messages_and_both_sides_for_common(self):
        data=self.summary_data()
        value={'insights':[],'common':[{'text':'双方接受基础反馈','citations':[{'messageId':'a','quote':'我接受基础反馈'},{'messageId':'b','quote':'我也接受基础反馈'}]}],'differences':[],'questions':[]}
        self.assertEqual(len(tasks.validate_summary(json.dumps(value),data)['common']),1)
        value['common'][0]['citations'].pop()
        with self.assertRaises(ValueError):tasks.validate_summary(json.dumps(value),data)
        value['common']=[];value['insights']=[{'text':'某条收获','citations':[{'messageId':'missing','quote':'虚构'}]}]
        with self.assertRaises(ValueError):tasks.validate_summary(json.dumps(value),data)

    def test_summary_rejects_fake_quotes_and_allows_no_consensus(self):
        data=self.summary_data()
        value={'insights':[],'common':[],'differences':[{'text':'表达趋同的顾虑仍在','citations':[{'messageId':'b','quote':'仍担心表达趋同'}]}],'questions':[]}
        self.assertEqual(tasks.validate_summary(json.dumps(value),data)['common'],[])
        value['differences'][0]['citations'][0]['quote']='我们一致赞同自动评分'
        with self.assertRaises(ValueError):tasks.validate_summary(json.dumps(value),data)

    def test_no_summary_from_material_notes_alone(self):
        with self.assertRaises(ValueError):tasks.prepare_summary({'messages':[{'id':'x','who':'材料 A','kind':'note','text':'原材料'}]})

    def test_companion_changes_actual_prompt_and_requires_grounded_contribution(self):
        data={'speaker':self.me,'opponent':self.other,'companion':self.companion,'companionFor':'me','turn':0,'messages':[],'additions':[]}
        prompt=server.build_messages(data)
        self.assertIn(self.companion['body'],prompt[1]['content'])
        self.assertIn('同伴',prompt[1]['content'])
        raw={'text':'同伴提到教师负担，我们可将错别字检查与评分分开。','companionContribution':{'text':'增加教师负担的理由','quote':'工具可以节省检查错别字的时间'}}
        self.assertIn('教师',tasks.validate_companion(json.dumps(raw),data)['text'])
        data['companion']={**self.companion,'body':'学生希望保留自己的写作表达。'}
        self.assertNotEqual(prompt,server.build_messages(data))
        with self.assertRaises(ValueError):tasks.validate_companion(json.dumps(raw),data)
        raw['companionContribution']=None
        with self.assertRaises(ValueError):tasks.validate_companion(json.dumps(raw),data)

    def test_companion_cannot_duplicate_an_opponent(self):
        with self.assertRaises(ValueError):server.build_messages({'speaker':self.me,'opponent':self.other,'companion':self.other,'companionFor':'me','turn':0})

    def test_new_tasks_use_same_provider_and_never_fallback(self):
        with patch.object(server.zhihu_api,'secret',return_value='test'),patch.object(server,'configured',return_value=True),patch.object(server.zhihu_api,'completion',side_effect=server.zhihu_api.APIError('额度受限',429)),patch.object(server,'urlopen') as fallback:
            with self.assertRaises(server.zhihu_api.APIError):server.generate([],structured=True)
            fallback.assert_not_called()

    def test_http_tasks_return_validated_fields_and_reject_invalid_citations(self):
        app=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        threading.Thread(target=app.serve_forever,daemon=True).start()
        def post(path,data):
            return json.load(urlopen(Request(f'http://127.0.0.1:{app.server_port}'+path,
                data=json.dumps(data).encode(),headers={'Content-Type':'application/json'})))
        def output(value):
            return {'provider':'zhihu','model':'test-only','requestId':'qa','generatedAt':1,'text':json.dumps(value)}
        try:
            analysis={'me':{'title':'分工','claim':'基础反馈与评分分开','conditions':'教师评分','quoteId':'p1'},
                'candidates':[{'id':'other','title':'表达','claim':'保留独特表达','conditions':'反对自动评分','quoteId':'p1','relation':'similar','basis':'same_conclusion','reason':'结论接近，理由不同','myQuoteId':'p1'}]}
            with patch.object(server,'generate',return_value=output(analysis)):
                result=post('/api/thought/analyze',{'topicId':'snail','me':self.me,'candidates':[self.other]})
                self.assertEqual(result['me']['quote'],self.me['body'])
                self.assertNotIn('text',result)
            summary={'insights':[],'common':[],'differences':[{'text':'保留表达顾虑','citations':[{'messageId':'b','quoteId':'p1'}]}],'questions':[]}
            with patch.object(server,'generate',return_value=output(summary)):
                result=post('/api/discussion/summary',{'topicId':'snail',**self.summary_data()})
                self.assertIn('表达',result['differences'][0]['citations'][0]['quote'])
            summary['differences'][0]['citations'][0]['messageId']='invented'
            with patch.object(server,'generate',return_value=output(summary)):
                with self.assertRaises(HTTPError) as error:post('/api/discussion/summary',self.summary_data())
                self.assertEqual(error.exception.code,502)
        finally:
            app.shutdown();app.server_close()


if __name__=='__main__':unittest.main()
