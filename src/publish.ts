// 게시 시각이 지난 승인된 게시물 중 가장 이른 것 하나를 올립니다. --dry-run은 컨테이너까지만 만들고 게시하지 않습니다.
import { requireEnv } from './config.ts';
import { instagram } from './instagram.ts';
import {
  activePhotos,
  composeCaption,
  loadPosted,
  loadQueues,
  missingFiles,
  savePosted,
  validatePost,
} from './queue.ts';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const only = args.includes('--post') ? args[args.indexOf('--post') + 1] : undefined;
const token = requireEnv('IG_ACCESS_TOKEN');
const repo = process.env.GITHUB_REPOSITORY;
const mediaBase =
  process.env.MEDIA_BASE_URL || (repo && `https://raw.githubusercontent.com/${repo}/main/`);
if (!mediaBase)
  throw new Error('MEDIA_BASE_URL이 없습니다. 인스타그램이 이미지를 받을 공개 URL이 필요합니다.');

const posted = await loadPosted();
const posts = (await loadQueues()).flatMap((queue) => queue.posts);
const post = only
  ? posts.find((p) => p.id === only)
  : posts
      .filter((p) => !p.skip && !posted[p.id] && Date.parse(p.scheduledAt) <= Date.now())
      .toSorted((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))[0];
if (!post) {
  console.log(only ? `${only} 게시물이 없습니다.` : '지금 올릴 게시물이 없습니다.');
  process.exit(only ? 1 : 0);
}
if (post.skip || posted[post.id]?.mediaId) {
  console.log(`${post.id}는 skip이거나 이미 게시됐습니다.`);
  process.exit(0);
}

const save = async (entry: (typeof posted)[string]) => {
  if (dryRun) return;
  posted[post.id] = entry;
  await savePosted(posted);
};
// 잘못된 게시물은 실패로 기록해 다음 게시물이 막히지 않게 합니다. 고친 뒤 data/posted.json에서 그 항목을 지우면 다시 시도합니다.
const errors = [
  ...validatePost(post),
  ...(await missingFiles(post)).map((file) => `파일 없음: ${file}`),
];
if (errors.length) {
  await save({ failed: errors });
  throw new Error(`${post.id}를 건너뜁니다:\n- ${errors.join('\n- ')}`);
}

const caption = composeCaption(post);
const ig = instagram(token);
const { user_id, username } = await ig.me();
// 게시 후 기록 전에 작업이 끊겼다면 다시 올리지 않고 기록만 남깁니다.
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();
const existing = (await ig.recentMedia(user_id)).data.find(
  (media) => media.caption && normalize(media.caption) === normalize(caption),
);
if (existing) {
  await save({
    mediaId: existing.id,
    permalink: existing.permalink,
    publishedAt: new Date().toISOString(),
  });
  console.log(`이미 올라가 있습니다: ${existing.permalink}`);
  process.exit(0);
}
if ((await ig.quotaLeft(user_id)) < 1) throw new Error('24시간 API 게시 한도를 다 썼습니다.');

const urls = activePhotos(post).map((photo) => new URL(photo.file, mediaBase).href);
console.log(`@${username}: ${post.id} ${post.areaName} (${urls.length}장) 준비 중`);
const containerId = await ig.createCarousel(user_id, urls, caption);
if (dryRun) {
  console.log(`dry-run: 캐러셀 컨테이너 ${containerId} 준비 완료. 게시하지 않았습니다.`);
  process.exit(0);
}
const { id } = await ig.publish(user_id, containerId);
const { permalink } = await ig.permalink(id);
await save({ mediaId: id, permalink, publishedAt: new Date().toISOString() });
console.log(`게시 완료: ${permalink}`);
