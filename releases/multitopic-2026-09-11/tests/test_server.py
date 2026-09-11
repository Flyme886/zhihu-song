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
    def test_turn_exchange_and_boundaries(self):
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
                payload=json.loads(FakeProvider.seen[-1]['messages'][1]['content'])
                self.assertEqual(payload['additions'],['新增条件'])
                self.assertEqual(payload['speaker']['author'],'A')
                json.load(post(dict(data,topicId='sun',topic='wrong topic',rules='wrong rules',period='2024')))
                topic_payload=json.loads(FakeProvider.seen[-1]['messages'][1]['content'])
                self.assertEqual(topic_payload['topic'],server.zhihu_api.TOPICS['sun']['title'])
                self.assertEqual(topic_payload['rules'],server.zhihu_api.TOPICS['sun']['rules'])
                self.assertNotEqual(topic_payload['period'],'2024')
                with self.assertRaises(HTTPError) as e:post(dict(data,turn=6))
                self.assertEqual(e.exception.code,400)
            self.assertEqual(json.load(urlopen(url+'/api/case'))['topicId'],'robotaxi')
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
if __name__=='__main__':unittest.main()
