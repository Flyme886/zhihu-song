export const STORY_STORAGE_KEY = 'gravity.story.v1';
export const STORY_TITLE = '我想留下的，其实是什么？';
export const OLD_JUDGMENT = '没有电视，客厅好像也没必要。';
export const ENDING_LABELS = Object.freeze({keep:'保留原判断', supplement:'补充一个前提', changed:'改变原判断'});
export const CONDITIONS = Object.freeze({alone:'主要是我一个人住', family:'经常和家人一起住'});

const clone = value => structuredClone(value);
const seed = (id, kind, topicId, topicTitle, title, summary, body, extra = {}) => ({
  id, kind, topicId, topicTitle, title, summary, body, date:null,
  sourceKind:'story-demo', demo:true, origin:'预置往事 · 故事演示', ...extra,
});

export const STORY_MEMORIES = Object.freeze([
  seed('canteen-opinion', 'opinions', 'canteen', '食堂里，那张空着的椅子', '我只想安静吃顿饭',
    '最初，我把独处和不合群画了等号。',
    '那天端着餐盘，我又绕过了坐满人的长桌。我想：一个人吃饭多省心，不必找话题，也不必等谁。\n\n可我还是挑了一个能看见入口的位置。后来回想，那个动作比我的判断更诚实。',
    {judgment:'一个人吃饭挺好，我不需要饭搭子。', chapter:'最初的观点'}),
  seed('canteen-case', 'cases', 'canteen', '食堂里，那张空着的椅子', '一起吃饭，一定要聊天吗？',
    '一次对谈，把“陪伴”和“热闹”分开了。',
    '我以为找到饭搭子，就意味着每天都得表现得很热情。两种相反的经验，让这件事松动了一点。',
    {chapter:'一次讨论', messages:[
      {who:'阿禾 · 脚本角色', text:'我喜欢有人一起吃饭，但我们有时一句话也不说。有人在旁边，就已经很好。'},
      {who:'小宁 · 脚本角色', text:'我更享受独处。不过，选择一个人和只能一个人，对我来说不是同一种感觉。'},
      {who:'故事中的我', text:'也许我担心的不是陪伴，而是陪伴附带的社交任务。'},
    ]}),
  seed('canteen-record', 'records', 'canteen', '食堂里，那张空着的椅子', '给陪伴留一个可选项',
    '后来，我约了一顿不必努力聊天的午饭。',
    '我仍然喜欢一个人吃饭。但我想留一个可以约人的选项，不用先证明自己很合群。\n\n下次可以直接说：“一起吃吗？今天有点累，可能话不多。”',
    {chapter:'后来留下的记录', ending:'supplement', note:'我需要的也许是低压力的陪伴，而不是每天热闹。'}),
  seed('cat-art-opinion', 'opinions', 'cat-art', '猫把画碰倒以后', '不像作品，就不值得留下？',
    '最初，我只想留下完成得足够好的东西。',
    '画到一半，猫从桌边经过，水杯倒了，蓝色漫过了整张纸。我第一反应是把它扔掉。\n\n我想收藏的是“画得不错”的证据，不是一次失手。',
    {judgment:'画坏了的东西，留着也没有意义。', chapter:'最初的观点'}),
  seed('cat-art-case', 'cases', 'cat-art', '猫把画碰倒以后', '我们是在保存作品，还是那一天？',
    '另一种看法，让洇开的蓝色有了不同的名字。',
    '那张纸放在桌上晾干时，我们谈到了“留下”的标准。',
    {chapter:'一次讨论', messages:[
      {who:'林青 · 脚本角色', text:'如果它只是一张画，你可以重画。但那天下午和猫一起发生的事，重画不了。'},
      {who:'小宁 · 脚本角色', text:'有回忆不等于必须保存实物。拍张照，再决定，也是一种认真。'},
      {who:'故事中的我', text:'我可以先承认它让我舍不得，再决定用什么方式留下。'},
    ]}),
  seed('cat-art-record', 'records', 'cat-art', '猫把画碰倒以后', '把那片蓝色裁成了一张书签',
    '后来，留下的东西变小了，意义却清楚了。',
    '我没有装裱整张画。只把晕开的蓝色裁下一小片，写上那天的日期，夹进正在读的书里。\n\n我开始区分：我想证明自己做得很好，还是想记住自己确实生活过。',
    {chapter:'后来留下的记录', ending:'changed', note:'我想留下的不一定是最好的作品，也可以是一段真实发生过的生活。'}),
]);

export const STORY_OPINIONS = Object.freeze([
  {id:'ning', name:'小宁', role:'把空间还给自己', color:'blue', symbol:'◌',
    claim:'不必为了“像一个家”，保留一种房间。',
    body:'我把电视和沙发都搬走了。腾出来的地方铺瑜伽垫、晾衣服，也可以什么都不放。对我来说，客厅最好的用途，就是不必规定用途。',
    boundary:'前提是：我能自己决定这个空间如何使用。'},
  {id:'he', name:'阿禾', role:'给相聚留一个位置', color:'gold', symbol:'✳',
    claim:'我留着客厅，因为人会在这里慢慢坐到一起。',
    body:'我家的电视一周也开不了一次。可饭后有人剥橘子，有人讲白天的小事。没有人正式邀请谁，大家就坐下来了。我想留的是这种不需要预约的相处。',
    boundary:'前提是：家人愿意、也有机会在这里相处。'},
  {id:'miao', name:'苗苗', role:'先试着生活，再给它命名', color:'sage', symbol:'⌁',
    claim:'也许先别决定要不要客厅，试两周再说。',
    body:'我没急着买一整套家具，只摆了轻便椅子和小桌。两周后才发现，自己常在那里读书、接朋友的视频。名字不重要，实际发生过的生活会告诉我该留什么。',
    boundary:'前提是：可以先做一次便宜、可恢复的尝试。'},
  {id:'lin', name:'林青', role:'分清物件与它承载的事', color:'rose', symbol:'◇',
    claim:'没有电视之后，先问问什么会一起消失。',
    body:'小时候我以为一家人在一起，就是坐在电视前。后来才知道，电视只是个借口。真正难替代的是一起耗一点时间。但如果那个借口早已失效，也可以换一个。',
    boundary:'前提是：我们能说清自己舍不得的究竟是什么。'},
]);

const ROLE_LINES = {
  ning:{
    alone:['如果主要是你一个人住，我仍支持去掉默认的客厅配置。空出来的地方，本身就是一种用途。','你在家真正想做、却总找不到地方做的一件事，是什么？','如果答案是舒展身体或铺开材料，先为它挪一次家具。你不需要为了一个房间的名字，牺牲自己的日常。'],
    family:['和家人一起住时，“我不用”就不等于“大家不用”。我会先问每个人现在在哪里相聚。','假如去掉沙发，家里那个最常坐在那里的人，还有舒服的去处吗？','我仍不主张按样板间生活。但改造之前，要把别人的使用方式也算进去。空间自由需要一起商量。'],
  },
  he:{
    alone:['主要一个人住的话，我的经验未必适合你。为偶尔的聚会，长期空出最大的房间，不一定值得。','你想念的是每天有人坐在旁边，还是偶尔邀请朋友来的那一晚？','如果只是偶尔见朋友，也许几把能收起来的椅子就够了。想要连接，不一定得保留完整的客厅。'],
    family:['经常与家人一起住，我会更在意：家里有没有一个大家能自然停留的地方。它不必有电视。','你们上一次在家闲聊，发生在哪里？是因为那里舒服，还是因为只有那里能坐？','如果大家确实会聚在那里，我愿意保留它，再一起改变布置。值得留下的，是容易发生的相处。'],
  },
  miao:{
    alone:['一个人住，试错相对简单。把桌椅移到一边，给自己两周，看看这块地方自然变成什么。','哪种变化做起来最轻，而且一个周末就能恢复？','先记下实际使用的三个时刻，再决定买什么、留什么。不要让一次想象替整年的生活做决定。'],
    family:['家人一起住，试验也可以一起做。先约定试两周，保留每个人必须用到的座位和通道。','谁可能最不适应这次变化？怎样让那个人也能随时说“我们改回来”？','把“可恢复”说清楚，试验才不是一个人的决定。最后看大家实际怎么用，而不只听谁更会表达。'],
  },
  lin:{
    alone:['如果主要是你自己住，过去一家人看电视的回忆，未必需要用今天的一整间客厅来保存。','让你舍不得的，是现在的某个习惯，还是过去的一段生活？','回忆可以换一种载体。留下小灯、旧照片或一把椅子，也可能比保留整套布置更接近你的心意。'],
    family:['如果家人仍常常在一起，那段相处还在继续。电视可以退出，承载相处的地方却未必该一起消失。','拿掉电视以后，你们愿意一起做的第一件小事是什么？','如果有一个真实的答案，先为它留地方。如果没有，也值得继续问；回忆不能替现在的人作答。'],
  },
};

export function dialogueRounds({selectedOpinionIds,condition}) {
  const roles = selectedOpinionIds.map(id=>STORY_OPINIONS.find(role=>role.id===id)).filter(Boolean);
  if(roles.length!==2 || !CONDITIONS[condition]) return [];
  const message = (role,text)=>({who:role.name, role:'脚本角色 · 演示发言', opinionId:role.id, text});
  return [
    {id:'meet', title:'先让两种生活坐下来', prompt:'同一个“客厅”，可能装着不同的日常。', messages:roles.map(role=>message(role,role.claim+' '+role.body))},
    {id:'condition', title:'只换一个生活前提', prompt:`现在的前提：${CONDITIONS[condition]}。`, messages:roles.map(role=>message(role,ROLE_LINES[role.id][condition][0]))},
    {id:'question', title:'把问题交还给你', prompt:'不用急着选边。哪一个问题，更接近你真正的犹豫？', messages:roles.map((role,index)=>message(role,`${roles[1-index].name}提到的生活让我想追问：${ROLE_LINES[role.id][condition][1]}`))},
    {id:'leave', title:'留下一件可以试的小事', prompt:'改变判断不是必选项，把判断的前提说清楚就很好。', messages:roles.map(role=>message(role,ROLE_LINES[role.id][condition][2]))},
  ];
}

export function endingNote(ending,condition) {
  const notes = {
    alone:{
      keep:'我仍觉得，不需要为电视保留一间客厅。主要一个人住时，我更想把空间还给每天真正会做的事。',
      supplement:'我不需要以电视为中心的客厅。但如果想读书、放空或偶尔招待朋友，我愿意为这些具体的时刻留一点位置。',
      changed:'我改变了“没有电视就不需要客厅”的判断。即使一个人住，我也想留一个可以停下来、好好照顾自己的地方。',
    },
    family:{
      keep:'我仍不想保留默认的客厅配置。但和家人一起住时，改变布置前，我会先确认每个人都有舒服的相处和休息位置。',
      supplement:'没有电视，也不代表客厅没有意义。如果家人愿意自然地坐到一起，我想留的就是这个让相处容易发生的地方。',
      changed:'我改变了原来的判断。客厅的意义不由电视决定；和家人一起住时，我想留下一个不必预约就能相聚的地方。',
    },
  };
  return notes[condition]?.[ending]||'';
}

const freshMain = ()=>({stage:'intro',readOpinionIds:[],selectedOpinionIds:[],activeOpinionId:null,condition:'alone',round:0,ending:null,note:'',noteEdited:false,record:null});
const fresh = ()=>({version:1,openedMemoryIds:[],activeMemoryId:null,main:freshMain()});
const stages = new Set(['intro','viewpoints','dialogue','reflection','saved']);
const roleIds = new Set(STORY_OPINIONS.map(role=>role.id));
const seedIds = new Set(STORY_MEMORIES.map(item=>item.id));

function validate(value) {
  if(!value || value.version!==1 || !Array.isArray(value.openedMemoryIds) || !value.main) throw Error('存储格式不完整');
  const m=value.main;
  if(!stages.has(m.stage) || !CONDITIONS[m.condition] || !Array.isArray(m.readOpinionIds) || !Array.isArray(m.selectedOpinionIds)
    || m.readOpinionIds.some(id=>!roleIds.has(id)) || m.selectedOpinionIds.some(id=>!roleIds.has(id))
    || new Set(m.selectedOpinionIds).size!==m.selectedOpinionIds.length || m.selectedOpinionIds.length>2
    || typeof m.note!=='string' || typeof m.noteEdited!=='boolean' || !Number.isInteger(m.round) || m.round<0 || m.round>3
    || (m.ending!==null && !ENDING_LABELS[m.ending]) || (m.record && (m.record.id!=='living-room-record'||typeof m.record.note!=='string'||!Array.isArray(m.record.messages)))
    || (['dialogue','reflection','saved'].includes(m.stage) && m.selectedOpinionIds.length!==2)
    || (m.stage==='saved'&&!m.record)) throw Error('存储内容不完整');
  return value;
}

/** A separate local story: no requests, no account data, no SessionStore writes. */
export class StoryStore {
  constructor({storage,now=()=>new Date().toISOString()}={}) {
    this.listeners=new Set();this.now=now;this.data=fresh();this.blocked=false;
    this.persistence={ok:true,status:'ready',message:'进度仅保存在这台设备'};
    try {
      this.storage=storage===undefined?globalThis.localStorage:storage;
      if(!this.storage) throw Error('本机存储不可用');
      const raw=this.storage.getItem(STORY_STORAGE_KEY);
      if(raw) this.data=validate(JSON.parse(raw));
    } catch {
      this.blocked=true;
      this.persistence={ok:false,status:'error',message:'无法读取故事存档。原存档未被覆盖；本页可继续体验，但进度尚未保存。可重置这段演示后再试。'};
    }
  }
  getState(){return clone({...this.data,persistence:this.persistence});}
  subscribe(listener){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  emit(event){for(const listener of this.listeners){try{listener(this.getState(),event);}catch(error){console.error('Story subscriber failed',error);}}}
  memoryItems(){
    const items=STORY_MEMORIES.map(item=>({...clone(item),opened:this.data.openedMemoryIds.includes(item.id)}));
    if(this.data.main.record) items.push({...clone(this.data.main.record),opened:this.data.openedMemoryIds.includes('living-room-record')});
    return items;
  }
  invalid(error){return{ok:false,error};}
  commit(next,type='change',{requireSaved=false}={}) {
    try {
      if(this.blocked || !this.storage)throw Error('存储不可用');
      this.storage.setItem(STORY_STORAGE_KEY,JSON.stringify(next));
      this.data=next;this.persistence={ok:true,status:'saved',message:'已保存到这台设备'};
      this.emit({type});return{ok:true};
    }catch{
      if(!requireSaved)this.data=next;
      this.persistence={ok:false,status:'error',message:'本机保存失败。当前内容仍在本页，刷新后可能丢失；请重试保存，或复制便签留存。'};
      this.emit({type:'error',action:type});return{ok:false,error:this.persistence.message};
    }
  }
  change(mutate,type='change'){const next=clone(this.data);mutate(next);return this.commit(next,type);}
  start(){return this.change(data=>{data.activeMemoryId=null;},'start');}
  restart(){return this.change(data=>{const record=data.main.record;data.main=freshMain();data.main.record=record;data.activeMemoryId=null;},'restart');}
  openMemory(id){
    if(!this.memoryItems().some(item=>item.id===id))return this.invalid('这段记忆还没有留下。');
    return this.change(data=>{data.activeMemoryId=id;if(!data.openedMemoryIds.includes(id))data.openedMemoryIds.push(id);},'open');
  }
  showViewpoints(){return this.change(data=>{data.activeMemoryId=null;data.main.stage='viewpoints';},'viewpoints');}
  readOpinion(id){
    if(!roleIds.has(id))return this.invalid('没有找到这颗观点球。');
    return this.change(data=>{data.main.activeOpinionId=id;if(!data.main.readOpinionIds.includes(id))data.main.readOpinionIds.push(id);},'read');
  }
  setSelected(ids){
    if(!Array.isArray(ids)||ids.length>2||new Set(ids).size!==ids.length||ids.some(id=>!roleIds.has(id)))return this.invalid('请选两颗不同的观点球。');
    if(ids.some(id=>!this.data.main.readOpinionIds.includes(id)))return this.invalid('先读一读这颗观点球，再邀请它加入。');
    if(this.data.main.stage!=='viewpoints')return this.invalid('请回到观点球选择后调整。');
    return this.change(data=>{data.main.selectedOpinionIds=[...ids];},'selection');
  }
  beginDialogue(){
    if(this.data.main.stage!=='viewpoints')return this.invalid('先邀请两颗观点球，再开始对谈。');
    if(this.data.main.selectedOpinionIds.length!==2)return this.invalid('请邀请两颗观点球加入对谈。');
    return this.change(data=>{data.activeMemoryId=null;data.main.stage='dialogue';data.main.round=0;},'dialogue');
  }
  setCondition(condition){
    if(!CONDITIONS[condition])return this.invalid('请选择一个生活前提。');
    return this.change(data=>{data.main.condition=condition;if(data.main.ending&&!data.main.noteEdited)data.main.note=endingNote(data.main.ending,condition);},'condition');
  }
  advanceDialogue(){
    if(this.data.main.stage!=='dialogue')return this.invalid('先开始这段对谈。');
    return this.change(data=>{if(data.main.round<3)data.main.round++;else data.main.stage='reflection';},'advance');
  }
  chooseEnding(ending){
    if(!ENDING_LABELS[ending])return this.invalid('请选择一种收获。');
    if(!['reflection','saved'].includes(this.data.main.stage))return this.invalid('先听完对谈，再写下此刻的想法。');
    return this.change(data=>{data.main.stage='reflection';data.main.ending=ending;if(!data.main.noteEdited)data.main.note=endingNote(ending,data.main.condition);},'ending');
  }
  setNote(note){
    if(typeof note!=='string'||note.length>2000)return this.invalid('便签最多可以写 2000 字。');
    return this.change(data=>{data.main.note=note;data.main.noteEdited=true;},'note');
  }
  saveMemory(){
    const main=this.data.main;
    if(main.stage!=='reflection'||!ENDING_LABELS[main.ending])return this.invalid('先选择如何看待原来的判断。');
    if(!main.note.trim())return this.invalid('写下一点你想留下的东西，再保存。');
    const savedAt=this.now();
    const record={id:'living-room-record',kind:'records',topicId:'living-room',topicTitle:STORY_TITLE,title:'原来，我想留下的是……',
      summary:main.note.trim(),body:main.note.trim(),note:main.note.trim(),ending:main.ending,condition:main.condition,
      previous:OLD_JUDGMENT,selectedOpinionIds:[...main.selectedOpinionIds],
      messages:dialogueRounds(main).flatMap(round=>round.messages.map(message=>({...message,round:round.id,roundTitle:round.title}))),
      savedAt,date:savedAt,sourceKind:'story-demo',demo:true,origin:'我在故事里留下的便签',chapter:'此刻留下的记录'};
    const next=clone(this.data);next.main.record=record;next.main.stage='saved';next.activeMemoryId='living-room-record';
    if(!next.openedMemoryIds.includes(record.id))next.openedMemoryIds.push(record.id);
    const result=this.commit(next,'save',{requireSaved:true});return result.ok?{ok:true,record:clone(record)}:result;
  }
  reset(){
    try{
      if(!this.storage)throw Error('存储不可用');
      this.storage.removeItem(STORY_STORAGE_KEY);this.data=fresh();this.blocked=false;
      this.persistence={ok:true,status:'ready',message:'这段演示已重置，其他记录未改动'};this.emit({type:'reset'});return{ok:true};
    }catch{
      this.persistence={ok:false,status:'error',message:'演示重置失败，已有存档和本页内容都保留了。'};this.emit({type:'error',action:'reset'});return{ok:false,error:this.persistence.message};
    }
  }
}

export const createStoryStore = options => new StoryStore(options);
