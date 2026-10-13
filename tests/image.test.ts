import test from 'node:test';
import assert from 'node:assert/strict';
import { libraryBody } from '../src/caption.ts';
import type { Area } from '../src/config.ts';
import { lookFor, tooDark } from '../src/image.ts';

const bright = { mean: 140, black: 0.02 };

test('night shots get the moody look from KTO metadata or very low brightness', () => {
  assert.equal(lookFor('서울 야경 한강', bright), 'moody');
  assert.equal(lookFor('덕수궁 야간개장', bright), 'moody');
  assert.equal(lookFor('경복궁', { mean: 60, black: 0.1 }), 'moody');
  assert.equal(lookFor('경복궁', bright), 'clean');
  // 한강의 밤섬, 밤나무는 야경이 아닙니다.
  assert.equal(lookFor('한강 밤섬', bright), 'clean');
  assert.equal(lookFor('밤나무 숲길', bright), 'clean');
});

test('mostly black silhouettes are rejected but ordinary night shots are kept', () => {
  assert.equal(tooDark({ mean: 108, black: 0.46 }), true);
  assert.equal(tooDark({ mean: 61, black: 0.27 }), false);
});

test('library captions rotate per area and fall back when an area has none', () => {
  const area: Area = {
    id: 'a',
    name: 'Bukchon',
    city: 'Seoul',
    keywords: [],
    hashtags: [],
    captions: ['one', 'two'],
  };
  assert.deepEqual(
    [0, 1, 2].map((n) => libraryBody(area, n)),
    ['one', 'two', 'one'],
  );
  assert.match(libraryBody({ ...area, captions: [] }, 0), /Bukchon, Seoul/);
});
