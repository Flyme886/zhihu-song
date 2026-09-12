import test from 'node:test';
import assert from 'node:assert/strict';
import {StoryStore, createStoryStore, STORY_STORAGE_KEY, STORY_MEMORIES, STORY_OPINIONS, OLD_JUDGMENT, CONDITIONS, ENDING_LABELS, dialogueRounds, endingNote} from '../story.js';

const disk=()=>{
  const map=new Map(),writes=[];
  return{map,writes,getItem:key=>map.get(key)||null,setItem(key,value){writes.push(key);map.set(key,value);},removeItem(key){writes.push(key);map.delete(key);}};
};
const openDialogue=(store,ids=['ning','he'])=>{
  store.start();store.showViewpoints();for(const id of ids)store.readOpinion(id);
  assert.equal(store.setSelected(ids).ok,true);assert.equal(store.beginDialogue().ok,true);
};
const reflect=store=>{for(let i=0;i<4;i++)assert.equal(store.advanceDialogue().ok,true);assert.equal(store.getState().main.stage,'reflection');};

test('six distinct scripted memories are available in any order before starting',()=>{
  const store=createStoryStore({storage:disk()});
  assert.deepEqual(store.memoryItems().map(item=>item.id),['canteen-opinion','canteen-case','canteen-record','cat-art-opinion','cat-art-case','cat-art-record']);
  assert.deepEqual(store.memoryItems().map(item=>item.kind),['opinions','cases','records','opinions','cases','records']);
  for(const id of ['cat-art-record','canteen-case','cat-art-opinion','canteen-record','cat-art-case','canteen-opinion']){
    assert.equal(store.openMemory(id).ok,true);assert.equal(store.getState().activeMemoryId,id);
  }
  assert.equal(store.getState().main.stage,'intro');assert.equal(store.getState().openedMemoryIds.length,6);
  assert.ok(store.memoryItems().every(item=>item.demo&&item.origin.includes('故事演示')&&item.body.trim()));
  assert.equal(store.openMemory('not-a-memory').ok,false);assert.equal(store.memoryItems().length,6);
});

test('read and invitation are separate; exactly two different, read opinions can begin a discussion',()=>{
  const store=new StoryStore({storage:disk()});store.showViewpoints();
  assert.equal(store.setSelected(['ning','he']).ok,false);assert.equal(store.beginDialogue().ok,false);
  store.readOpinion('ning');assert.equal(store.getState().main.selectedOpinionIds.length,0);
  assert.equal(store.setSelected(['ning']).ok,true);assert.equal(store.beginDialogue().ok,false);
  store.readOpinion('he');store.readOpinion('lin');
  assert.equal(store.setSelected(['ning','ning']).ok,false);assert.equal(store.setSelected(['ning','he','lin']).ok,false);
  assert.equal(store.setSelected(['ning','he']).ok,true);assert.equal(store.beginDialogue().ok,true);
  assert.equal(store.setSelected(['ning','lin']).ok,false);
});

test('all six pairs determine both speakers, and both conditions alter responses and follow-up questions',()=>{
  const seen=new Set();
  for(let i=0;i<STORY_OPINIONS.length;i++)for(let j=i+1;j<STORY_OPINIONS.length;j++){
    const selectedOpinionIds=[STORY_OPINIONS[i].id,STORY_OPINIONS[j].id];
    const alone=dialogueRounds({selectedOpinionIds,condition:'alone'}),family=dialogueRounds({selectedOpinionIds,condition:'family'});
    assert.equal(alone.length,4);assert.deepEqual(alone[0],family[0]);
    assert.equal(alone.flatMap(round=>round.messages).length,8);
    for(const round of alone)assert.deepEqual(round.messages.map(message=>message.opinionId),selectedOpinionIds);
    for(const round of family)assert.deepEqual(round.messages.map(message=>message.opinionId),selectedOpinionIds);
    for(let round=1;round<4;round++)for(let speaker=0;speaker<2;speaker++){
      assert.notEqual(alone[round].messages[speaker].text,family[round].messages[speaker].text);
      assert.ok(alone[round].messages[speaker].role.includes('脚本角色'));
    }
    seen.add(JSON.stringify(alone));
  }
  assert.equal(seen.size,6);assert.deepEqual(dialogueRounds({selectedOpinionIds:['ning'],condition:'alone'}),[]);
});

test('every ending under both conditions produces a distinct saved memory with complete discussion',()=>{
  const notes=new Set();
  for(const condition of Object.keys(CONDITIONS))for(const ending of Object.keys(ENDING_LABELS)){
    const storage=disk(),store=new StoryStore({storage,now:()=> '2026-09-11T12:00:00.000Z'});
    openDialogue(store);store.setCondition(condition);reflect(store);
    assert.equal(store.chooseEnding(ending).ok,true);assert.equal(store.getState().main.note,endingNote(ending,condition));
    const result=store.saveMemory();assert.equal(result.ok,true);assert.equal(result.record.ending,ending);
    assert.equal(result.record.condition,condition);assert.equal(result.record.previous,OLD_JUDGMENT);
    assert.equal(result.record.savedAt,'2026-09-11T12:00:00.000Z');assert.equal(result.record.messages.length,8);
    assert.equal(result.record.id,'living-room-record');assert.equal(store.memoryItems().length,7);
    notes.add(result.record.note);
    const restored=new StoryStore({storage});assert.deepEqual(restored.memoryItems(),store.memoryItems());
    assert.equal(restored.openMemory(result.record.id).ok,true);assert.equal(restored.getState().main.stage,'saved');
  }
  assert.equal(notes.size,6);
});

test('reload retains opened memories, focused and read opinions, chosen pair, round, condition, ending and edited note',()=>{
  const storage=disk();let store=new StoryStore({storage});
  store.openMemory('cat-art-case');openDialogue(store,['miao','lin']);store.setCondition('family');store.advanceDialogue();
  let state=store.getState();store=new StoryStore({storage});assert.deepEqual(store.getState().main,state.main);
  assert.equal(store.getState().main.activeOpinionId,'lin');assert.ok(store.getState().openedMemoryIds.includes('cat-art-case'));
  store.advanceDialogue();store.advanceDialogue();store.advanceDialogue();store.chooseEnding('supplement');store.setNote('我想先和家人试着挪一次椅子。');
  store=new StoryStore({storage});assert.equal(store.getState().main.ending,'supplement');assert.equal(store.getState().main.note,'我想先和家人试着挪一次椅子。');
  store.setCondition('alone');assert.equal(store.getState().main.note,'我想先和家人试着挪一次椅子。');
  store.chooseEnding('changed');assert.equal(store.getState().main.note,'我想先和家人试着挪一次椅子。');
  assert.equal(store.saveMemory().ok,true);assert.equal(store.memoryItems().at(-1).note,'我想先和家人试着挪一次椅子。');
});

test('condition changes before editing update the proposed note, while manual text is preserved',()=>{
  const store=new StoryStore({storage:disk()});openDialogue(store);reflect(store);store.chooseEnding('keep');
  const first=store.getState().main.note;store.setCondition('family');assert.notEqual(store.getState().main.note,first);
  assert.equal(store.getState().main.note,endingNote('keep','family'));
  store.setNote('我的原话。');store.chooseEnding('supplement');assert.equal(store.getState().main.note,'我的原话。');
});

test('saving requires a completed discussion, an explicit ending and a nonempty note',()=>{
  const store=new StoryStore({storage:disk()});assert.equal(store.chooseEnding('keep').ok,false);assert.equal(store.saveMemory().ok,false);
  openDialogue(store);assert.equal(store.chooseEnding('changed').ok,false);reflect(store);assert.equal(store.saveMemory().ok,false);
  store.chooseEnding('keep');store.setNote('   ');assert.equal(store.saveMemory().ok,false);assert.equal(store.memoryItems().length,6);
  assert.equal(store.setNote('字'.repeat(2001)).ok,false);assert.equal(store.setCondition('unknown').ok,false);
});

test('all story operations and reset preserve gravity.sessions.v1 byte-for-byte',()=>{
  const storage=disk(),session='{"version":1,"topics":{"private":{"input":"已有的用户内容"}}}';storage.setItem('gravity.sessions.v1',session);storage.setItem('unrelated','untouched');storage.writes.length=0;
  const store=new StoryStore({storage});store.openMemory('canteen-record');openDialogue(store);reflect(store);store.chooseEnding('changed');store.saveMemory();
  assert.equal(storage.getItem('gravity.sessions.v1'),session);assert.ok(storage.writes.every(key=>key===STORY_STORAGE_KEY));
  assert.equal(store.reset().ok,true);assert.equal(storage.getItem(STORY_STORAGE_KEY),null);assert.equal(storage.getItem('gravity.sessions.v1'),session);assert.equal(storage.getItem('unrelated'),'untouched');
  assert.equal(store.memoryItems().length,6);assert.equal(store.getState().main.stage,'intro');
});

test('storage failure emits no save event, creates no memory, keeps editable note, and can retry successfully',()=>{
  const storage=disk(),store=new StoryStore({storage});openDialogue(store);reflect(store);store.chooseEnding('supplement');
  const before=storage.getItem(STORY_STORAGE_KEY),set=storage.setItem.bind(storage),events=[];store.subscribe((_state,event)=>events.push(event));
  storage.setItem=()=>{throw Error('quota exceeded');};
  store.setNote('空间可以改变，相处的位置要一起决定。');const result=store.saveMemory();
  assert.equal(result.ok,false);assert.equal(store.getState().main.stage,'reflection');assert.equal(store.getState().main.record,null);assert.equal(store.memoryItems().length,6);
  assert.equal(storage.getItem(STORY_STORAGE_KEY),before);assert.equal(store.getState().persistence.ok,false);
  assert.ok(!events.some(event=>event.type==='save'));assert.ok(events.every(event=>event.type==='error'));
  assert.equal(store.getState().main.note,'空间可以改变，相处的位置要一起决定。');
  storage.setItem=set;assert.equal(store.saveMemory().ok,true);assert.equal(events.filter(event=>event.type==='save').length,1);assert.equal(store.memoryItems().length,7);
});

test('unreadable stored data is never silently overwritten, and an explicit reset restores the story',()=>{
  const storage=disk(),raw='{broken JSON';storage.setItem(STORY_STORAGE_KEY,raw);storage.writes.length=0;
  const store=new StoryStore({storage});assert.equal(store.getState().persistence.ok,false);store.openMemory('canteen-case');store.showViewpoints();
  assert.equal(storage.getItem(STORY_STORAGE_KEY),raw);assert.equal(storage.writes.length,0);
  assert.equal(store.reset().ok,true);assert.equal(store.getState().persistence.ok,true);assert.equal(store.showViewpoints().ok,true);
  const malformed={version:1,openedMemoryIds:[],main:{...store.getState().main,stage:'dialogue',selectedOpinionIds:[]}};
  storage.setItem(STORY_STORAGE_KEY,JSON.stringify(malformed));assert.equal(new StoryStore({storage}).getState().persistence.ok,false);
});

test('failed reset leaves saved memory and backing store intact',()=>{
  const storage=disk(),store=new StoryStore({storage});openDialogue(store);reflect(store);store.chooseEnding('keep');store.saveMemory();
  const before=storage.getItem(STORY_STORAGE_KEY);storage.removeItem=()=>{throw Error('denied');};
  assert.equal(store.reset().ok,false);assert.equal(store.memoryItems().length,7);assert.equal(storage.getItem(STORY_STORAGE_KEY),before);
});

test('returned snapshots do not let consumers mutate the stored story or its seed memories',()=>{
  const store=new StoryStore({storage:disk()}),memories=store.memoryItems(),state=store.getState();
  memories[0].title='overwritten';memories[1].messages[0].text='overwritten';state.main.readOpinionIds.push('not-a-role');
  assert.equal(store.memoryItems()[0].title,STORY_MEMORIES[0].title);assert.notEqual(store.memoryItems()[1].messages[0].text,'overwritten');assert.equal(store.getState().main.readOpinionIds.length,0);
  const events=[];const unsubscribe=store.subscribe((snapshot,event)=>{snapshot.main.note='changed by listener';events.push(event.type);});
  store.start();unsubscribe();store.start();assert.deepEqual(events,['start']);assert.equal(store.getState().main.note,'');
});

test('starting resumes progress and replay retains the saved memory until a new ending is saved',()=>{
  const store=new StoryStore({storage:disk()});openDialogue(store);store.advanceDialogue();store.openMemory('cat-art-record');store.start();
  assert.equal(store.getState().activeMemoryId,null);assert.equal(store.getState().main.round,1);assert.equal(store.getState().main.stage,'dialogue');
  store.advanceDialogue();store.advanceDialogue();store.advanceDialogue();store.chooseEnding('keep');store.saveMemory();const note=store.memoryItems().at(-1).note;
  store.restart();assert.equal(store.getState().main.stage,'intro');assert.equal(store.memoryItems().at(-1).note,note);assert.equal(store.memoryItems().length,7);
});
