// 다음 주(또는 --week로 지정한 주) 게시 큐를 만듭니다: queue/<주>/posts.json, README.md 미리보기, media/<주>/*.jpg
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { claudeClient, curate, libraryBody } from './caption.ts';
import { loadConfig, requireEnv, type Area } from './config.ts';
import { isoWeek, slotTimes, weekIndex, weekMonday } from './dates.ts';
import {
  applyLook,
  download,
  lookFor,
  measure,
  thumbnail,
  tooDark,
  toPortrait,
  type Look,
} from './image.ts';
import { searchPhotos, type KtoPhoto } from './kto.ts';
import { composeCaption, loadQueues, maxHashtags, saveQueue, type Post } from './queue.ts';
import { areaOrder, diversify, eligible, type AreaUse } from './select.ts';

const args = process.argv.slice(2);
const weekArg = args.includes('--week') ? args[args.indexOf('--week') + 1] : undefined;
const week = weekArg ?? isoWeek(new Date(Date.now() + 7 * 86_400_000));
const monday = weekMonday(week);
const { areas, schedule } = await loadConfig();
const serviceKey = requireEnv('KTO_SERVICE_KEY');
const queues = await loadQueues();
if (queues.some((queue) => queue.week === week)) {
  console.log(`${week} 큐가 이미 있습니다: queue/${week}/posts.json`);
  process.exit(0);
}

const warmup = schedule.postsPerDayByWeek;
const perDay =
  warmup[Math.min(Math.max(0, weekIndex(schedule.startDate, monday)), warmup.length - 1)];
const slots = slotTimes(monday, schedule.slotsKst[String(perDay)]).filter(
  (at) => Date.parse(at) > Date.now(),
);
if (!slots.length) throw new Error(`${week}에는 남은 게시 시간이 없습니다`);

// 이미 큐에 들어갔거나 Claude가 뺀 사진은 게시 여부나 skip과 상관없이 다시 고르지 않습니다.
const exclude = new Set(
  queues.flatMap((q) =>
    q.posts.flatMap((p) => [...p.photos.map((ph) => ph.id), ...(p.rejected ?? [])]),
  ),
);
const history: AreaUse[] = queues.flatMap((q) =>
  q.posts.filter((p) => !p.skip).map((p) => ({ area: p.area, at: p.scheduledAt })),
);
const searched = new Map<string, KtoPhoto[]>();
const unusable = new Set<string>();
const client = args.includes('--no-claude') ? null : claudeClient();
if (!client)
  console.warn('ANTHROPIC_API_KEY가 없어 지역별 캡션 묶음을 쓰고, 사진은 앞에서부터 고릅니다.');

async function photosFor(area: Area) {
  if (!searched.has(area.id)) {
    const found = new Map<string, KtoPhoto>();
    for (const keyword of area.keywords) {
      for (const photo of await searchPhotos(serviceKey, keyword)) found.set(photo.id, photo);
    }
    searched.set(area.id, [...found.values()]);
  }
  const photos = eligible(searched.get(area.id) ?? [], area, schedule.minYear, exclude);
  return diversify(photos).filter((photo) => !unusable.has(photo.id));
}

async function buildPost(id: string, at: string, area: Area): Promise<Post | null> {
  const { min, max, candidates } = schedule.photosPerPost;
  const found: { photo: KtoPhoto; image: Buffer; look: Look }[] = [];
  for (const photo of await photosFor(area)) {
    if (found.length === (client ? candidates : max)) break;
    const cropped = await download(photo.imageUrl)
      .then(toPortrait)
      .catch(() => null);
    const tone = cropped && (await measure(cropped));
    if (!cropped || !tone || tooDark(tone)) {
      unusable.add(photo.id);
      continue;
    }
    const look = lookFor(`${photo.title} ${photo.keywords.join(' ')}`, tone);
    found.push({ photo, image: await applyLook(cropped, look), look });
  }
  if (found.length < min) return null;

  const curation = client
    ? await curate(
        client,
        area,
        found.map(({ photo }) => photo),
        await Promise.all(found.map(({ image }) => thumbnail(image))),
        { min, max },
      )
    : null;
  const order = curation?.picks ?? found.slice(0, max).map((_, i) => i);
  const picked = order.map((i) => found[i]);
  await mkdir(`media/${week}`, { recursive: true });
  const files = picked.map((_, i) => `media/${week}/${id}-${i + 1}.jpg`);
  await Promise.all(picked.map(({ image }, i) => writeFile(files[i], image)));
  return {
    id,
    scheduledAt: at,
    area: area.id,
    areaName: area.name,
    body: curation?.body ?? libraryBody(area, history.filter((use) => use.area === area.id).length),
    bodySource: curation ? 'claude' : 'library',
    hashtags: [...new Set([...schedule.baseHashtags, ...area.hashtags])].slice(0, maxHashtags),
    photos: picked.map(({ photo, look }, i) => ({
      id: photo.id,
      title: photo.title,
      photographer: photo.photographer,
      shotMonth: photo.shotMonth,
      file: files[i],
      look,
    })),
    ...(curation?.picks && {
      rejected: found.filter((_, i) => !order.includes(i)).map(({ photo }) => photo.id),
    }),
  };
}

const posts: Post[] = [];
const emptySlots: string[] = [];
for (const at of slots) {
  const id = `${week}-${String(posts.length + 1).padStart(2, '0')}`;
  let post: Post | null = null;
  for (const area of areaOrder(areas, history, at, schedule.areaCooldownDays)) {
    post = await buildPost(id, at, area);
    if (post) break;
  }
  if (!post) {
    emptySlots.push(at);
    continue;
  }
  posts.push(post);
  history.push({ area: post.area, at });
  for (const photoId of [...post.photos.map((p) => p.id), ...(post.rejected ?? [])])
    exclude.add(photoId);
  console.log(`${id} ${at} ${post.areaName} (${post.photos.length}장, 캡션: ${post.bodySource})`);
}
if (!posts.length)
  throw new Error(`${week}: 조건에 맞는 사진이 부족해 게시물을 하나도 만들지 못했습니다`);

const weekday = (at: string) =>
  '일월화수목금토'[new Date(Date.parse(at) + 9 * 3_600_000).getUTCDay()];
const when = (at: string) =>
  `${at.slice(5, 7)}/${at.slice(8, 10)} (${weekday(at)}) ${at.slice(11, 16)}`;
const readme = [
  `# ${week} 게시 계획 (${posts.length}개)`,
  '이 PR을 머지하면 아래 게시물이 예정 시각에 자동으로 올라갑니다. 머지하지 않으면 아무것도 올라가지 않습니다.',
  [
    '검토할 것:',
    '- 비슷한 구도가 겹치는 사진, 얼굴이 크게 나온 인물 사진(초상권), 어색하게 잘린 사진은 `posts.json`에서 그 사진에 `"skip": true`를 넣어 빼 주세요. 게시물마다 5장 이상 남아야 합니다.',
    '- 게시물을 통째로 빼려면 그 게시물에 `"skip": true`를 넣으세요.',
    '- 캡션 본문은 `body`를 고치면 됩니다. 사실과 다른 내용이 없는지 봐 주세요.',
    '- 이 미리보기는 생성 시점 기준이라, `posts.json`을 고쳐도 여기는 바뀌지 않습니다.',
  ].join('\n'),
  ...(emptySlots.length
    ? [`⚠️ 쓸 사진이 부족해 비운 시간: ${emptySlots.map(when).join(', ')}`]
    : []),
  ...posts.map((post, i) =>
    [
      `## ${i + 1}. ${when(post.scheduledAt)} · ${post.areaName}`,
      `\`${post.id}\` · 캡션: ${post.bodySource === 'claude' ? 'Claude' : '지역 캡션 묶음 (사진에 맞게 고쳐도 됩니다)'}`,
      post.photos.map((photo) => `<img src="../../${photo.file}" width="150">`).join(' '),
      '```text\n' + composeCaption(post) + '\n```',
    ].join('\n\n'),
  ),
].join('\n\n');
await saveQueue({ week, posts }, readme + '\n');
console.log(`\nqueue/${week}/README.md 에서 미리보기를 확인하세요.`);
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `week=${week}\nposts=${posts.length}\n`);
}
