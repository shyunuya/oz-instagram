import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';

export const captionLimit = 2200;
export const maxHashtags = 5;
export const photoLimits = { min: 5, max: 10 };

export type PostPhoto = {
  id: string;
  title: string;
  photographer: string;
  shotMonth: string;
  file: string;
  look?: 'clean' | 'moody';
  skip?: boolean;
};
export type Post = {
  id: string;
  scheduledAt: string;
  area: string;
  areaName: string;
  body: string;
  bodySource: 'claude' | 'library';
  hashtags: string[];
  skip?: boolean;
  photos: PostPhoto[];
  rejected?: string[];
};
export type Queue = { week: string; posts: Post[] };
export type Posted = Record<
  string,
  { mediaId?: string; permalink?: string; publishedAt?: string; failed?: string[] }
>;

export const activePhotos = (post: Post) => post.photos.filter((photo) => !photo.skip);

// 공공누리 제1유형 출처표시: 저작물명, 작성자, 연도, 기관, 유형, 출처. LLM이 아니라 코드가 붙입니다.
export function credits(photos: PostPhoto[]) {
  const lines = photos.map(
    (photo, i) =>
      `${i + 1}. ${photo.title} — ${photo.photographer}, ${photo.shotMonth.slice(0, 4)}`,
  );
  return [
    '📷 Korea Tourism Organization (한국관광공사) · KOGL Type 1 (공공누리 제1유형)',
    ...lines,
    'Source: phoko.visitkorea.or.kr',
  ].join('\n');
}

export function composeCaption(post: Post) {
  return [
    post.body.trim(),
    `📍 ${post.areaName}, Seoul`,
    post.hashtags.join(' '),
    credits(activePhotos(post)),
  ].join('\n\n');
}

export function validatePost(post: Post) {
  const errors: string[] = [];
  const count = activePhotos(post).length;
  if (count < photoLimits.min || count > photoLimits.max) {
    errors.push(`사진은 ${photoLimits.min}~${photoLimits.max}장이어야 합니다 (지금 ${count}장)`);
  }
  if (!post.body.trim()) errors.push('캡션 본문(body)이 비어 있습니다');
  if (post.hashtags.length > maxHashtags)
    errors.push(`해시태그는 ${maxHashtags}개 이하여야 합니다`);
  const length = composeCaption(post).length;
  if (length > captionLimit) errors.push(`캡션이 ${captionLimit}자를 넘습니다 (${length}자)`);
  if (Number.isNaN(Date.parse(post.scheduledAt)))
    errors.push(`게시 시각이 잘못됐습니다: ${post.scheduledAt}`);
  return errors;
}

export async function missingFiles(post: Post) {
  const results = await Promise.all(
    activePhotos(post).map((photo) =>
      access(photo.file).then(
        () => null,
        () => photo.file,
      ),
    ),
  );
  return results.filter((file) => file !== null);
}

export async function loadQueues(): Promise<Queue[]> {
  const weeks = await readdir('queue').catch(() => [] as string[]);
  const queues = await Promise.all(
    weeks.toSorted().map((week) =>
      readFile(`queue/${week}/posts.json`, 'utf8').then(
        (text) => JSON.parse(text) as Queue,
        () => null,
      ),
    ),
  );
  return queues.filter((queue) => queue !== null);
}

export async function saveQueue(queue: Queue, readme: string) {
  await mkdir(`queue/${queue.week}`, { recursive: true });
  await writeFile(`queue/${queue.week}/posts.json`, JSON.stringify(queue, null, 2) + '\n');
  await writeFile(`queue/${queue.week}/README.md`, readme);
}

export async function loadPosted(): Promise<Posted> {
  return JSON.parse(await readFile('data/posted.json', 'utf8'));
}

export async function savePosted(posted: Posted) {
  await writeFile('data/posted.json', JSON.stringify(posted, null, 2) + '\n');
}
