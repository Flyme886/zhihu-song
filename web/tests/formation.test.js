import test from 'node:test';
import assert from 'node:assert/strict';
import {draftFill} from '../formation.js';

test('a draft begins with a visible seed and fills progressively as text grows', () => {
  assert.ok(draftFill('') > 0 && draftFill('') < .2);
  assert.equal(draftFill('   '), draftFill(''));
  const levels = [1, 20, 80, 200, 3000].map(n => draftFill('想'.repeat(n)));
  levels.forEach((level, i) => {
    assert.ok(level > (i ? levels[i - 1] : draftFill('')));
    assert.ok(level <= 1);
  });
  assert.ok(levels.at(-1) > .99);
});
