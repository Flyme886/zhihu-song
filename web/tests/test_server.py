import importlib.util
import json
import os
import threading
import tempfile
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from unittest.mock import patch
from pathlib import Path
spec=importlib.util.spec_from_file_location('adapter',Path(__file__).resolve().parents[1]/'server.py')
server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server)
class FakeProvider(BaseHTTPRequestHandler):
    seen=[]
    def log_message(self,*args):pass
    def do_POST(self):
        data=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        self.seen.append(data)
        body=json.dumps({'choices':[{'message':{'content':'测试模型回应'}}]}).encode()
        self.send_response(200);self.end_headers();self.wfile.write(body)
class AdapterTest(unittest.TestCase):
    def test_private_config_preserves_process_env_and_never_executes_values(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {'AGENT_MODEL':'process-model'}, clear=True):
            path=Path(directory)/'.env.local'
            path.write_text('# private settings\nAGENT_API_KEY="test-only"\nAGENT_API_BASE=https://api.deepseek.com\nAGENT_MODEL=file-model\nAGENT_DEFAULT_PROVIDER=compatible\nIGNORED=value\n')
            server.load_local_config(path)
            self.assertEqual(os.environ['AGENT_MODEL'],'process-model')
            self.assertEqual(os.environ['AGENT_API_KEY'],'test-only')
            self.assertEqual(os.environ['AGENT_DEFAULT_PROVIDER'],'compatible')
            self.assertNotIn('IGNORED',os.environ)
            path.write_text('AGENT_API_BASE=$(must-not-run)\n')
            del os.environ['AGENT_API_BASE']
            server.load_local_config(path)
            self.assertEqual(os.environ['AGENT_API_BASE'],'$(must-not-run)')

    def test_explicit_default_uses_deepseek_even_when_zhihu_is_configured(self):
        config={'AGENT_API_KEY':'test-only','AGENT_API_BASE':'https://api.deepseek.com','AGENT_MODEL':'deepseek-flash','AGENT_DEFAULT_PROVIDER':'compatible'}
        with patch.dict(os.environ,config,clear=True), patch.object(server.zhihu_api,'secret',return_value='zhihu-test'), patch.object(server.zhihu_api,'completion') as zhihu, patch.object(server,'urlopen') as upstream:
            upstream.return_value.__enter__.return_value.read.return_value=json.dumps({'id':'request-test','model':'deepseek-flash','choices':[{'finish_reason':'stop','message':{'content':'真实接口格式的测试回复'}}]})
            for structured in [False,True]:
                result=server.generate([{'role':'user','content':'请返回 JSON'}],structured=structured)
                request=upstream.call_args.args[0]
                payload=json.loads(request.data)
                self.assertEqual(request.full_url,'https://api.deepseek.com/chat/completions')
                self.assertEqual(request.get_header('Authorization'),'Bearer test-only')
                self.assertEqual(payload['thinking'],{'type':'disabled'})
                self.assertFalse(payload['stream'])
                self.assertEqual(payload.get('response_format'),{'type':'json_object'} if structured else None)
                self.assertEqual(result['requestId'],'request-test')
                self.assertEqual(result['model'],'deepseek-flash')
                self.assertFalse(result['fromCache'])
            zhihu.assert_not_called()
            upstream.side_effect=HTTPError('https://api.deepseek.com/chat/completions',402,'private upstream detail',{},None)
            with self.assertRaises(server.zhihu_api.APIError) as error:server.generate([])
            self.assertEqual(error.exception.status,402)
            self.assertIn('余额不足',str(error.exception))
            self.assertNotIn('private upstream detail',str(error.exception))
            zhihu.assert_not_called()

    def test_truncated_deepseek_reply_is_not_accepted_as_complete(self):
        config={'AGENT_API_KEY':'test-only','AGENT_API_BASE':'https://api.deepseek.com','AGENT_MODEL':'deepseek-flash'}
        with patch.dict(os.environ,config,clear=True), patch.object(server,'urlopen') as upstream:
            upstream.return_value.__enter__.return_value.read.return_value=json.dumps({'choices':[{'finish_reason':'length','message':{'content':'未完成的回复'}}]})
            with self.assertRaises(server.zhihu_api.APIError) as error:server.generate([],provider='compatible')
            self.assertIn('未生成完整',str(error.exception))

    def test_long_original_reaches_model_without_truncation(self):
        original='正文段落。'*2000+'原回答最后一句。'
        data={'topicId':'snail','speaker':{'author':'A','body':original},'opponent':{'author':'B','body':'另一份原回答'},'turn':0,'messages':[{'text':original,'who':'A'}],'additions':[]}
        messages=server.build_messages(data)
        payload=json.loads(messages[1]['content'].split('<discussion-data>')[1].split('</discussion-data>')[0])
        self.assertEqual(payload['speaker']['body'],original)
        self.assertEqual(payload['messages'][0]['text'],original)

    @patch.object(server.zhihu_api,'secret',return_value='')
    def test_turn_exchange_and_boundaries(self,_secret):
        provider=ThreadingHTTPServer(('127.0.0.1',0),FakeProvider)
        app=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        for instance in [provider,app]:threading.Thread(target=instance.serve_forever,daemon=True).start()
        url=f'http://127.0.0.1:{app.server_port}'
        data={'speaker':{'author':'A','body':'观点A'},'opponent':{'author':'B','body':'观点B'},'turn':0,'messages':[],'additions':['新增条件']}
        def post(payload):return urlopen(Request(url+'/api/agent/turn',data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'}))
        try:
            with patch.dict(os.environ,{},clear=True):
                self.assertFalse(json.load(urlopen(url+'/api/agent/status'))['configured'])
                with self.assertRaises(HTTPError) as e:post(data)
                self.assertEqual(e.exception.code,503)
            with patch.dict(os.environ,{'AGENT_API_KEY':'test-only','AGENT_API_BASE':f'http://127.0.0.1:{provider.server_port}/v1','AGENT_MODEL':'mock'}):
                status=json.load(urlopen(url+'/api/agent/status'))
                self.assertEqual(status['model'],'mock')
                self.assertNotIn('test-only',json.dumps(status))
                self.assertEqual(json.load(post(data))['text'],'测试模型回应')
                payload=json.loads(FakeProvider.seen[-1]['messages'][1]['content'].split('<discussion-data>')[1].split('</discussion-data>')[0])
                self.assertEqual(payload['additions'],['新增条件'])
                self.assertEqual(payload['speaker']['author'],'A')
                with self.assertRaises(HTTPError) as e:post(dict(data,turn=6))
                self.assertEqual(e.exception.code,400)
            for topic in ['snail','cat-art','robotaxi']:
                self.assertEqual(json.load(urlopen(url+'/api/case?topicId='+topic))['topicId'],topic)
            with self.assertRaises(HTTPError) as e:urlopen(url+'/api/case?topicId=unknown')
            self.assertEqual(e.exception.code,400)
            self.assertEqual(len(json.load(urlopen(url+'/cases/catalog.json'))),9)
            with self.assertRaises(HTTPError):urlopen(url+'/.data/snail.json')
            for path in ['/.env.local','/../.env.local','/%2e%2e/.env.local']:
                with self.assertRaises(HTTPError) as e:urlopen(url+path)
                self.assertEqual(e.exception.code,404)
            with self.assertRaises(HTTPError) as e:urlopen(url+'/server.py')
            self.assertEqual(e.exception.code,404)
        finally:
            for instance in [provider,app]:instance.shutdown();instance.server_close()

    def test_glb_is_served_only_from_public_daylight_assets(self):
        app=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        threading.Thread(target=app.serve_forever,daemon=True).start()
        url=f'http://127.0.0.1:{app.server_port}'
        try:
            response=urlopen(url+'/assets/planet/daylight/traveler.glb')
            self.assertEqual(response.headers.get_content_type(), 'model/gltf-binary')
            self.assertEqual(response.read()[:4], b'glTF')
            for path in ['/traveler.glb','/assets/planet/daylight/%2e%2e/private.glb','/assets/planet/daylight/missing.glb']:
                with self.assertRaises(HTTPError) as error:urlopen(url+path)
                self.assertEqual(error.exception.code,404)
        finally:app.shutdown();app.server_close()

    def test_auto_prefers_zhihu_and_does_not_fall_back_on_failure(self):
        app=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        threading.Thread(target=app.serve_forever,daemon=True).start()
        data={'provider':'auto','topicId':'snail','speaker':{'author':'A','body':'观点A'},'opponent':{'author':'B','body':'观点B'},'turn':0,'messages':[],'additions':['新的条件']}
        request=Request(f'http://127.0.0.1:{app.server_port}/api/agent/turn',data=json.dumps(data).encode(),headers={'Content-Type':'application/json'})
        try:
            with patch.object(server.zhihu_api,'secret',return_value='test-only'),patch.object(server,'configured',return_value=True),patch.object(server.zhihu_api,'completion',side_effect=server.zhihu_api.APIError('额度受限',429)),patch.object(server,'urlopen') as compatible:
                with self.assertRaises(HTTPError) as e:urlopen(request)
                self.assertEqual(e.exception.code,429)
                compatible.assert_not_called()
        finally:app.shutdown();app.server_close()
if __name__=='__main__':unittest.main()
