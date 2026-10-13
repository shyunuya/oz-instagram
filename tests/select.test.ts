import test from 'node:test';
import assert from 'node:assert/strict';
import type { Area } from '../src/config.ts';
import type { KtoPhoto } from '../src/kto.ts';
import { areaOrder, diversify, eligible } from '../src/select.ts';

const area = (id: string, anyYear = false): Area => ({
  id,
  name: id,
  city: 'Seoul',
  keywords: [id],
  hashtags: [],
  captions: [],
  anyYear,
});
const photo = (id: string, shotMonth: string, extra: Partial<KtoPhoto> = {}): KtoPhoto => ({
  id,
  title: id,
  imageUrl: `https://example.com/${id}.jpg`,
  photographer: 'A',
  location: '서울특별시 종로구',
  shotMonth,
  createdAt: `${shotMonth}01000000`,
  keywords: [],
  ...extra,
});

test('only Seoul photos that are recent enough and not already queued are eligible', () => {
  const photos = [
    photo('new', '202405'),
    photo('old', '201205'),
    photo('busan', '202405', { location: '부산광역시 해운대구' }),
    photo('queued', '202405'),
  ];
  const ids = (list: KtoPhoto[]) => list.map((p) => p.id);
  assert.deepEqual(ids(eligible(photos, area('city'), 2015, new Set(['queued']))), ['new']);
  assert.deepEqual(ids(eligible(photos, area('palace', true), 2015, new Set())), [
    'new',
    'old',
    'queued',
  ]);
});

test('photos from the same shoot are spread out instead of taken back to back', () => {
  const shoot = { title: '덕수궁' };
  const photos = [
    photo('a1', '202405', { ...shoot, photographer: 'A' }),
    photo('a2', '202405', { ...shoot, photographer: 'B' }),
    photo('a3', '202405', { ...shoot, photographer: 'C' }),
    photo('b1', '202310', shoot),
    photo('c1', '202405', { title: '덕수궁 돌담길' }),
  ];
  assert.deepEqual(
    diversify(photos).map((p) => p.id),
    ['a1', 'c1', 'b1', 'a2', 'a3'],
  );
});

test('area rotation skips recently used areas and prefers the least recently used', () => {
  const areas = [area('a'), area('b'), area('c'), area('d')];
  const history = [
    { area: 'a', at: '2026-10-19T12:00:00+09:00' },
    { area: 'b', at: '2026-10-10T12:00:00+09:00' },
    { area: 'c', at: '2026-10-01T12:00:00+09:00' },
  ];
  const order = areaOrder(areas, history, '2026-10-20T12:00:00+09:00', 5).map((a) => a.id);
  assert.deepEqual(order, ['d', 'c', 'b']);
});
