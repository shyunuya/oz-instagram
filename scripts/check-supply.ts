// 구현 단계 0: 지역별 서울 사진 수와 이미지 해상도를 확인해 몇 주 분량인지 계산합니다.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { searchPhotos, type KtoPhoto } from '../src/kto.ts';

type Area = { id: string; name: string; keywords: string[] };
type Size = { width: number; height: number };

const serviceKey = process.env.KTO_SERVICE_KEY;
if (!serviceKey)
  throw new Error('KTO_SERVICE_KEY가 없습니다. .env.example을 보고 .env를 만드세요.');
const areas: Area[] = JSON.parse(await readFile('config/areas.json', 'utf8'));
const samplesPerArea = 5;
const fits45 = ({ width, height }: Size) => Math.min(width, height * 0.8) >= 1080;
const fits11 = ({ width, height }: Size) => Math.min(width, height) >= 1080;

async function sizeOf(url: string): Promise<Size | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const { width = 0, height = 0 } = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
  return { width, height };
}

// 최신순으로 정렬한 뒤 고르게 뽑아, 오래된 사진의 해상도도 보이게 합니다.
function spread<T>(items: T[], n: number) {
  if (items.length <= n) return items;
  return Array.from({ length: n }, (_, i) => items[Math.floor((i * items.length) / n)]);
}

const allSeoul = new Map<string, KtoPhoto & { area: string }>();
const rows = [];
const sizes: Size[] = [];
for (const area of areas) {
  const found = new Map<string, KtoPhoto>();
  for (const keyword of area.keywords) {
    for (const photo of await searchPhotos(serviceKey, keyword)) found.set(photo.id, photo);
  }
  const seoul = [...found.values()]
    .filter((photo) => photo.location.includes('서울'))
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const photo of seoul)
    if (!allSeoul.has(photo.id)) allSeoul.set(photo.id, { ...photo, area: area.id });
  const sampled = (
    await Promise.all(spread(seoul, samplesPerArea).map((p) => sizeOf(p.imageUrl)))
  ).filter((size) => size !== null);
  sizes.push(...sampled);
  rows.push({
    area: area.id,
    hits: found.size,
    seoul: seoul.length,
    noLocation: [...found.values()].filter((photo) => !photo.location).length,
    newest: seoul[0]?.shotMonth || '-',
    oldest: seoul.at(-1)?.shotMonth || '-',
    samples: sampled.map((s) => `${s.width}x${s.height}`).join(' '),
  });
}
console.table(rows);

const seoulOnly = (await searchPhotos(serviceKey, '서울')).filter((p) =>
  p.location.includes('서울'),
);
const pct = (n: number) => `${Math.round((n / Math.max(sizes.length, 1)) * 100)}%`;
console.log(`\n지역 목록 기준 서울 사진(중복 제거): ${allSeoul.size}장`);
console.log(`키워드 '서울' 전체 검색 결과 중 촬영지가 서울인 사진: ${seoulOnly.length}장`);
console.log(
  `해상도 표본 ${sizes.length}장 중 4:5(1080x1350)로 크롭 가능 ${pct(sizes.filter(fits45).length)}, 1:1(1080) 가능 ${pct(sizes.filter(fits11).length)}`,
);
for (const perDay of [10, 15]) {
  console.log(
    `하루 ${perDay}장이면 약 ${Math.floor(allSeoul.size / perDay / 7)}주 분량 (해상도 필터 전)`,
  );
}

await mkdir('tmp', { recursive: true });
await writeFile('tmp/supply.json', JSON.stringify([...allSeoul.values()], null, 2));
console.log('\n전체 목록: tmp/supply.json');
