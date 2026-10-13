// 인스타그램 장기 토큰을 갱신해 인자로 받은 파일에 씁니다. 워크플로가 이 파일로 GitHub Secret을 바꿉니다.
import { writeFile } from 'node:fs/promises';
import { requireEnv } from './config.ts';
import { refreshToken } from './instagram.ts';

const out = process.argv[2];
if (!out) throw new Error('사용법: node src/refresh-token.ts <출력 파일>');
const { access_token, expires_in } = await refreshToken(requireEnv('IG_ACCESS_TOKEN'));
await writeFile(out, access_token, { mode: 0o600 });
console.log(`토큰을 갱신했습니다. 만료까지 ${Math.round(expires_in / 86_400)}일 남았습니다.`);
