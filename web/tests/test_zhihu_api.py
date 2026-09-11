import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import zhihu_api as z
import tempfile
import json
import unittest
from unittest.mock import patch

def item(token='123', **changes):
    return dict({'ContentType':'Answer','ContentID':token,'Title':'如何看待萝卜快跑？',
        'ContentText':'<em>萝卜快跑</em>的推广需要考虑安全、成本与就业过渡。这里是用于测试的接口摘要，不是真实答主内容。',
        'Url':f'https://www.zhihu.com/answer/{token}?utm_source=test',
        'AuthorName':'测试作者','AuthorAvatar':'https://pic1.zhimg.com/example.jpg','EditTime':1720756800}, **changes)

class ZhihuTest(unittest.TestCase):
    def test_topics_reject_cross_question_and_path_traversal(self):
        snail=item(Title='蜗牛追杀',ContentText='关于蜗牛追杀的讨论材料，需要尊重每日随机出现与不可辨认的前提。',Url='https://www.zhihu.com/question/286619877/answer/123',EditTime=1780000000)
        self.assertEqual(z.normalize(snail,'snail')['topicId'],'snail')
        self.assertIsNone(z.normalize(snail,'cat-art'))
        self.assertIsNone(z.normalize(snail,'robotaxi'))
        with self.assertRaises(z.APIError):z.cached('../secret')

    def test_topic_cache_isolation_and_nonhistorical_search(self):
        with tempfile.TemporaryDirectory() as d, patch.object(z,'CACHE',Path(d)/'robotaxi.json'), patch.object(z,'secret',return_value='test-only'), patch.object(z,'ATTEMPTS',{}):
            def response(path,params):
                self.assertEqual(path,'/api/v1/content/question_answers')
                qid=params['QuestionUrl'].rsplit('/',1)[-1]
                self.assertNotIn('SortBy',params)
                return {'Data':{'Items':[{'ContentType':'answer','ContentToken':str(i),'Url':f'https://www.zhihu.com/question/{qid}/answer/{i}','Summary':'本题的一份真实接口格式摘要。'} for i in (123,456)],'Paging':{'IsEnd':True}}}
            with patch.object(z,'request',side_effect=response) as request:
                z.sync('snail');z.sync('cat-art');z.sync('snail')
                self.assertEqual(request.call_count,2)
            self.assertEqual(z.cached('snail')['topicId'],'snail')
            self.assertEqual(z.cached('cat-art')['topicId'],'cat-art')
            self.assertFalse(z.cached()['answers'])

    def test_question_summary_without_author_and_one_result_is_usable(self):
        value={'ContentType':'answer','ContentToken':'123','Url':'https://www.zhihu.com/question/286619877/answer/123?utm_source=test','Summary':'<p>一份很短的摘要。</p>'}
        n=z.normalize_question_answer(value,'snail','286619877')
        self.assertEqual(n['author'],'作者信息未提供')
        self.assertEqual(n['avatar'],'')
        self.assertNotIn('published',n)
        self.assertEqual(n['body'],'一份很短的摘要。')
        self.assertIn('utm_source=test',n['url'])
        self.assertIsNone(z.normalize_question_answer(dict(value,ContentToken='999'),'snail','286619877'))
        self.assertIsNone(z.normalize_question_answer(value,'snail','356196758'))
        with tempfile.TemporaryDirectory() as d, patch.object(z,'CACHE',Path(d)/'robotaxi.json'), patch.object(z,'secret',return_value='test-only'), patch.object(z,'ATTEMPTS',{}):
            with patch.object(z,'request',return_value={'Data':{'Items':[value],'Paging':{'IsEnd':True}}}):
                self.assertEqual(len(z.sync('snail')['answers']),1)

    def test_question_pagination_uses_server_cursor_after_empty_page(self):
        value={'ContentType':'answer','ContentToken':'123','Url':'https://www.zhihu.com/answer/123','Summary':'第二页的有效摘要'}
        with tempfile.TemporaryDirectory() as d, patch.object(z,'CACHE',Path(d)/'robotaxi.json'), patch.object(z,'secret',return_value='test-only'), patch.object(z,'ATTEMPTS',{}):
            responses=[{'Data':{'Items':[],'Paging':{'IsEnd':False,'NextOffset':31}}},{'Data':{'Items':[value],'Paging':{'IsEnd':True}}}]
            with patch.object(z,'request',side_effect=responses) as request:
                data=z.sync('snail')
                self.assertEqual(request.call_args_list[1].args[1]['Offset'],31)
                self.assertEqual(data['requestCount'],2)
            with patch.object(z,'request') as request:
                self.assertTrue(z.sync('snail')['fromCache'])
                request.assert_not_called()
                with self.assertRaises(z.APIError) as e:z.sync('snail',force=True)
                self.assertEqual(e.exception.status,429)

    def test_bad_pagination_keeps_previous_cache(self):
        with tempfile.TemporaryDirectory() as d, patch.object(z,'CACHE',Path(d)/'robotaxi.json'), patch.object(z,'secret',return_value='test-only'), patch.object(z,'ATTEMPTS',{}):
            old={'version':1,'topicId':'snail','answers':[{'id':'old'}],'syncedAt':1}
            z.cache_path('snail').write_text(json.dumps(old))
            with patch.object(z,'request',return_value={'Data':{'Items':[],'Paging':{'IsEnd':False,'NextOffset':0}}}):
                with self.assertRaises(z.APIError):z.sync('snail')
            self.assertEqual(z.cached('snail'),old)

    def test_normalize_provenance(self):
        n=z.normalize(item())
        self.assertNotIn('<em>',n['body'])
        self.assertIn('utm_source=test',n['url'])
        self.assertEqual(n['exampleRelation'],'unknown')
        self.assertIn('摘要',n['source'])
        self.assertEqual(n['author'],'测试作者')
        self.assertIsNone(z.normalize(item(EditTime=1770000000)))
        self.assertIsNone(z.normalize(item(ContentType='Question')))
        self.assertIsNone(z.normalize(item(Url='https://evil.example/123')))
        self.assertEqual(z.normalize(item(AuthorAvatar='javascript:alert(1)'))['avatar'],'')

    def test_search_index_hash_is_not_the_answer_id(self):
        n=z.normalize(item(ContentID='-1414549421237729668'))
        self.assertEqual(n['answerId'],'123')
        self.assertEqual(n['contentStatus'],'excerpt')
        self.assertNotIn('contentHtml',n)

    def test_cached_excerpts_cannot_overwrite_verified_originals(self):
        original=z.TOPICS['snail']['answers'][0]
        with tempfile.TemporaryDirectory() as d, patch.object(z,'CACHE',Path(d)/'robotaxi.json'):
            data={'version':1,'topicId':'snail','answers':[{'answerId':original['answerId'],'body':'截取文本','contentStatus':'excerpt'},{'answerId':'999','body':'新摘要','contentStatus':'excerpt'}]}
            z.cache_path('snail').write_text(json.dumps(data))
            answers=z.cached('snail')['answers']
            self.assertEqual(answers[0],original)
            self.assertEqual(answers[1]['contentStatus'],'excerpt')

    def test_cache_dedup_and_no_calls_on_reload(self):
        with tempfile.TemporaryDirectory() as d, patch.object(z,'CACHE',Path(d)/'data.json'), patch.object(z,'secret',return_value='test-only'), patch.object(z,'LAST_ATTEMPT',0):
            result={'Code':0,'Data':{'Items':[item(),item(),item('456')],'SearchHashId':'fixture'}}
            with patch.object(z,'request',return_value=result) as request:
                first=z.sync();second=z.sync()
                self.assertEqual(len(first['answers']),2)
                self.assertTrue(second['fromCache'])
                self.assertEqual(request.call_count,2)
                self.assertEqual(request.call_args.args[1]['Count'],10)
                self.assertIn(str(z.END),request.call_args.args[1]['SortBy'])

    def test_failed_second_search_does_not_publish_partial_result(self):
        with tempfile.TemporaryDirectory() as d, patch.object(z,'CACHE',Path(d)/'data.json'), patch.object(z,'secret',return_value='test-only'), patch.object(z,'LAST_ATTEMPT',0):
            with patch.object(z,'request',side_effect=[{'Data':{'Items':[item(),item('456')]}},z.APIError('额度受限',429)]):
                with self.assertRaises(z.APIError):z.sync()
            self.assertFalse(z.CACHE.exists())

    def test_zhida_contract_only_three_supported_fields(self):
        messages=[{'role':'user','content':'测试材料'}]
        with patch.object(z,'request',return_value={'choices':[{'message':{'content':'测试回应'}}]}) as request:
            self.assertEqual(z.turn(messages),'测试回应')
            payload=request.call_args.kwargs['payload']
            self.assertEqual(set(payload),{'model','messages','stream'})
            self.assertEqual(payload['messages'],messages)

    def test_real_completion_metadata_and_empty_reply_rejection(self):
        with patch.object(z,'request',return_value={'id':'request-123','choices':[{'message':{'content':'实际模型返回'},'finish_reason':'stop'}]}):
            result=z.completion([])
            self.assertEqual(result['requestId'],'request-123')
            self.assertEqual(result['provider'],'zhihu')
            self.assertFalse(result['fromCache'])
        for response in [{'choices':[{'message':{'content':''}}]},{'choices':[{'message':{'content':'半段'},'finish_reason':'error'}]}]:
            with patch.object(z,'request',return_value=response),self.assertRaises(z.APIError):z.completion([])

if __name__=='__main__':unittest.main()
