import test from 'node:test';
import assert from 'node:assert/strict';
import {analysisKey,companionForDiscussion} from '../thought-client.js';
import {snapshotDiscussion,recordMarkdown} from '../session.js';

const me={id:'me',author:'我',body:'支持基础反馈，教师决定分数'},other={id:'b',author:'B',body:'保留表达'},partner={id:'c',author:'C',body:'教师需要减负'};
test('analysis identity changes with revised conditions or source text, not canvas position',async()=>{
 const topic={id:'topic',rules:'保留原条件'},key=await analysisKey(topic,me,[other]);
 assert.equal(key,await analysisKey(topic,{...me,x:999},[other]));
 assert.notEqual(key,await analysisKey(topic,{...me,body:'允许自动评分'},[other]));
 assert.notEqual(key,await analysisKey(topic,me,[{...other,body:'更新后的材料'}]));
});
test('only my own distinct companion enters a paired discussion',()=>{
 assert.equal(companionForDiscussion(me,me,other,partner),partner);
 assert.equal(companionForDiscussion(me,me,other,other),null);
 assert.equal(companionForDiscussion(me,other,partner,partner),null);
});
test('saved summary and companion survive export and retain editable versus original text',()=>{
 const summary={insights:[{text:'我的确认',originalText:'AI 草稿',citations:[{messageId:'m1',quote:'教师需要减负'}]}],common:[],differences:[],questions:[]};
 const d={id:'d',source:me,target:other,companion:partner,summary,mode:'auto',turn:1,messages:[{id:'m1',who:'A',text:'教师需要减负',kind:'mine'}],additions:[],finished:true};
 const record=snapshotDiscussion(d,'我保留教师评分');
 d.summary.insights[0].text='后来的改动';
 assert.equal(record.summary.insights[0].text,'我的确认');
 const markdown=recordMarkdown(record);
 assert.match(markdown,/教师需要减负/);assert.match(markdown,/用户编辑/);assert.match(markdown,/依据 m1/);assert.equal(record.companion.id,'c');
});
