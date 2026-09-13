import test from 'node:test';
import assert from 'node:assert/strict';
import {placeHoverCard} from '../hover-card.js';

test('planet previews flip at the right edge and keep the target visible',()=>{
  const viewport={width:1000,height:768,top:72,bottom:108},card={width:360,height:560};
  const left=placeHoverCard({x:80,y:350,radius:40},card,viewport);
  const right=placeHoverCard({x:920,y:350,radius:40},card,viewport);
  assert.equal(left.side,'right');assert.ok(left.left>=120);
  assert.equal(right.side,'left');assert.ok(right.left+card.width<=880);
  for(const position of [left,right]){
    assert.ok(position.top>=72);
    assert.ok(position.top+card.height<=660,'sound and canvas controls keep their space');
  }
});
test('narrow and short viewports keep each preview within its usable bounds',()=>{
  for(const [width,height,bottom] of [[358,740,144],[780,768,108],[1140,500,108]]){
    const viewport={width,height,top:72,bottom};
    const card={width:Math.min(360,width-32),height:Math.min(560,height-72-bottom)};
    for(const x of [25,width/2,width-25])for(const y of [25,height/2,height-25]){
      const position=placeHoverCard({x,y,radius:35},card,viewport);
      assert.ok(position.left>=16&&position.left+card.width<=width-16);
      assert.ok(position.top>=72&&position.top+card.height<=height-bottom);
    }
  }
});
