import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import * as z from 'zod/v4';
import type { Area } from './config.ts';
import type { KtoPhoto } from './kto.ts';

const system = `You curate and caption posts for @seoulcity.the.brightest, an Instagram account that shows travelers the best-looking corners of Seoul, one neighborhood per carousel.`;
const Curation = z.object({
  photos: z.array(z.number().int()).describe('Chosen photo numbers, strongest first'),
  body: z.string().describe('Caption body'),
});

// 키가 없거나 Claude 호출이 실패하면 지역별 캡션 묶음을 순서대로 돌려 씁니다.
export function libraryBody(area: Area, timesUsed: number) {
  return (
    area.captions[timesUsed % area.captions.length] ??
    `A few frames from ${area.name}, ${area.city}. Which one would you visit first?`
  );
}

// ANTHROPIC_BASE_URL 같은 로컬 환경변수를 따라가지 않도록 공식 API 주소를 고정합니다.
export function claudeClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  return apiKey ? new Anthropic({ apiKey, baseURL: 'https://api.anthropic.com' }) : null;
}

export function validPicks(picks: number[], candidates: number, min: number, max: number) {
  const unique = new Set(picks);
  return (
    unique.size === picks.length &&
    picks.length >= min &&
    picks.length <= max &&
    picks.every((n) => Number.isInteger(n) && n >= 1 && n <= candidates)
  );
}

// 후보 중 게시할 사진과 순서(첫 장이 표지)를 고르고 캡션 본문을 씁니다. 지역 이름, 해시태그, 출처는 코드가 붙입니다.
// 일시적인 API 오류나 거절이면 null을 돌려주고, 호출한 쪽이 앞에서부터 고른 사진과 템플릿 캡션을 씁니다.
export async function curate(
  client: Anthropic,
  area: Area,
  photos: KtoPhoto[],
  thumbnails: Buffer[],
  limits: { min: number; max: number },
) {
  const titles = photos
    .map((photo, i) => `${i + 1}. ${photo.title} (${photo.location})`)
    .join('\n');
  try {
    const response = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(Curation) },
      system,
      messages: [
        {
          role: 'user',
          content: [
            ...thumbnails.map((image) => ({
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: 'image/jpeg' as const,
                data: image.toString('base64'),
              },
            })),
            {
              type: 'text',
              text: `These are ${photos.length} candidate photos of ${area.name}, ${area.city}, numbered 1–${photos.length} in the order shown. Titles from the Korea Tourism Organization archive:\n${titles}\n\nChoose ${limits.min}–${limits.max} photos for one carousel. Leave out near-duplicates of another candidate (same viewpoint and composition) and weak shots: very dark, blurry, awkwardly cropped, or with a recognizable person's face as the main subject. Order them strongest first, since the first photo is the cover.\n\nThen write the caption body in English: 2–3 short sentences about what the chosen photos show and why a traveler would enjoy the place. Add one practical tip only if you are sure it is accurate; never give prices or opening hours. At most one emoji. No hashtags, location line, or photo credits; those are added separately.`,
            },
          ],
        },
      ],
    });
    if (response.stop_reason === 'refusal') {
      console.warn(`Claude가 거절했습니다 (${area.id}): ${response.stop_details?.category}`);
      return null;
    }
    const result = response.parsed_output;
    if (!result?.body.trim()) return null;
    const picks = validPicks(result.photos, photos.length, limits.min, limits.max)
      ? result.photos.map((n) => n - 1)
      : null;
    return { picks, body: result.body.trim() };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw error;
    if (error instanceof Anthropic.BadRequestError) throw error;
    if (error instanceof Anthropic.APIError) {
      console.warn(`Claude API 오류 (${area.id}) ${error.status}: ${error.message}`);
      return null;
    }
    throw error;
  }
}
