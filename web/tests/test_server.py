import importlib.util
import json
import os
import threading
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
            with self.assertRaises(HTTPError) as e:urlopen(url+'/server.py')
            self.assertEqual(e.exception.code,404)
        finally:
            for instance in [provider,app]:instance.shutdown();instance.server_close()

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
