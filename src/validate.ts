// 아직 게시되지 않은 큐 항목이 게시 조건을 지키는지 확인합니다. PR에서 posts.json을 고친 뒤 CI가 돌립니다.
import { loadPosted, loadQueues, missingFiles, validatePost } from './queue.ts';

const posted = await loadPosted();
const pending = (await loadQueues())
  .flatMap((queue) => queue.posts)
  .filter((post) => !post.skip && !posted[post.id]);
let invalid = 0;
for (const post of pending) {
  const errors = [
    ...validatePost(post),
    ...(await missingFiles(post)).map((file) => `파일 없음: ${file}`),
  ];
  if (!errors.length) continue;
  invalid++;
  console.error(`${post.id}:\n- ${errors.join('\n- ')}`);
}
console.log(`게시 대기 ${pending.length}개 중 문제 ${invalid}개`);
if (invalid) process.exitCode = 1;
