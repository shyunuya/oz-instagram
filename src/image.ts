import sharp, { type OverlayOptions, type Sharp } from 'sharp';

export const portrait = { width: 1080, height: 1350 };
const maxUpscale = 1.6;

export type Look = 'clean' | 'moody';
export type Tone = { mean: number; black: number };
const nightWords = /야경|야간|밤(?!섬|나무)|불빛|빛초롱|야행/;

export async function download(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`이미지 ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// 관광공사 이미지는 긴 변이 1280px이라 4:5로 자르면 확대가 필요합니다. 1.6배를 넘으면(파노라마, 16:9 등) 흐려서 쓰지 않습니다.
export async function toPortrait(input: Buffer) {
  const { width = 0, height = 0 } = await sharp(input).metadata();
  const cropWidth = Math.min(width, (height * portrait.width) / portrait.height);
  if (cropWidth * maxUpscale < portrait.width) return null;
  return sharp(input)
    .rotate()
    .resize(portrait.width, portrait.height, { fit: 'cover', position: 'attention' })
    .png()
    .toBuffer();
}

// 평균 밝기(0~255)와 거의 검은 픽셀의 비율을 작은 흑백 썸네일로 잽니다.
export async function measure(image: Buffer): Promise<Tone> {
  const data = await sharp(image).greyscale().resize(108, 135).raw().toBuffer();
  const mean = data.reduce((sum, value) => sum + value, 0) / data.length;
  return { mean, black: data.filter((value) => value < 25).length / data.length };
}

// 표본에서 실루엣 사진은 검은 픽셀이 46%, 야경과 일반 사진은 27% 이하였습니다.
export const tooDark = (tone: Tone) => tone.black >= 0.4;

// 야경과 낮 사진은 평균 밝기가 겹쳐서, 관광공사 제목과 키워드를 먼저 보고 아주 어두운 사진만 밝기로 판단합니다.
export const lookFor = (text: string, tone: Tone): Look =>
  nightWords.test(text) || tone.mean < 65 ? 'moody' : 'clean';

const contrast = (image: Sharp, k: number, lift = 0) => image.linear(k, 128 * (1 - k) + lift);
const overlay = (svg: string) =>
  Buffer.from(`<svg width="${portrait.width}" height="${portrait.height}">${svg}</svg>`);
const tealTint = overlay('<rect width="100%" height="100%" fill="#1f6f78"/>');
const vignette = overlay(
  '<defs><radialGradient id="v" cx="50%" cy="45%" r="75%"><stop offset="55%" stop-color="#fff"/><stop offset="100%" stop-color="#b9b9b9"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#v)"/>',
);

// 계정 톤. Clean: 대비와 채도를 살짝 올리고 선명하게. Moody(야경): 어둡고 대비 강하게, 청록 톤과 비네트.
export async function applyLook(image: Buffer, look: Look) {
  const toned =
    look === 'clean'
      ? contrast(sharp(image), 1.08).modulate({ saturation: 1.12 }).sharpen({ sigma: 0.7 })
      : contrast(sharp(image), 1.15, -8)
          .modulate({ saturation: 0.82, brightness: 0.96 })
          .recomb([
            [1.04, 0, -0.02],
            [0, 1, 0.03],
            [-0.02, 0.04, 1.06],
          ]);
  const layers: OverlayOptions[] =
    look === 'moody'
      ? [
          { input: tealTint, blend: 'soft-light' },
          { input: vignette, blend: 'multiply' },
        ]
      : [];
  return sharp(await toned.png().toBuffer())
    .composite(layers)
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

// Claude에 보낼 때는 절반 크기로 줄여 토큰을 아낍니다.
export function thumbnail(image: Buffer) {
  return sharp(image).resize(540).jpeg({ quality: 80 }).toBuffer();
}
