import test from 'node:test';
import assert from 'node:assert/strict';
import { composeCaption, credits, validatePost, type Post } from '../src/queue.ts';

const post = (photoCount: number, extra: Partial<Post> = {}): Post => ({
  id: '2026-W43-01',
  scheduledAt: '2026-10-19T12:00:00+09:00',
  area: 'gyeongbokgung',
  areaName: 'Gyeongbokgung Palace',
  body: 'Morning light over the palace.',
  bodySource: 'claude',
  hashtags: ['#seoul', '#gyeongbokgung'],
  photos: Array.from({ length: photoCount }, (_, i) => ({
    id: `p${i + 1}`,
    title: '경복궁',
    photographer: `작가${i + 1}`,
    shotMonth: '202507',
    file: `media/2026-W43/2026-W43-01-${i + 1}.jpg`,
  })),
  ...extra,
});

test('credits list every posted photo with KOGL attribution and skip removed photos', () => {
  const draft = post(6);
  draft.photos[1].skip = true;
  const caption = composeCaption(draft);
  assert.match(
    caption,
    /^Morning light over the palace\.\n\n📍 Gyeongbokgung Palace, Seoul\n\n#seoul #gyeongbokgung\n\n📷/,
  );
  assert.match(caption, /KOGL Type 1 \(공공누리 제1유형\)/);
  assert.match(caption, /1\. 경복궁 — 작가1, 2025\n2\. 경복궁 — 작가3, 2025/);
  assert.doesNotMatch(caption, /작가2/);
  assert.match(credits([]), /Source: phoko\.visitkorea\.or\.kr$/);
});

test('posts need 5 to 10 photos, a body, at most 5 hashtags, and a caption under 2,200 characters', () => {
  assert.deepEqual(validatePost(post(5)), []);
  const tooFew = post(6);
  tooFew.photos[0].skip = tooFew.photos[1].skip = true;
  assert.equal(validatePost(tooFew).length, 1);
  assert.equal(validatePost(post(11)).length, 1);
  assert.equal(validatePost(post(5, { body: ' ' })).length, 1);
  assert.equal(validatePost(post(5, { hashtags: ['#a', '#b', '#c', '#d', '#e', '#f'] })).length, 1);
  assert.equal(validatePost(post(5, { body: 'x'.repeat(2200) })).length, 1);
});
