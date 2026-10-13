import { readFile } from 'node:fs/promises';

export type Area = {
  id: string;
  name: string;
  city: string;
  keywords: string[];
  hashtags: string[];
  captions: string[];
  anyYear?: boolean;
};
export type Schedule = {
  startDate: string;
  postsPerDayByWeek: number[];
  slotsKst: Record<string, string[]>;
  photosPerPost: { min: number; max: number; candidates: number };
  minYear: number;
  areaCooldownDays: number;
  baseHashtags: string[];
};

const readJson = async (file: string) => JSON.parse(await readFile(file, 'utf8'));

export async function loadConfig() {
  const areas: Area[] = await readJson('config/areas.json');
  const schedule: Schedule = await readJson('config/schedule.json');
  return { areas, schedule };
}

export function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name}가 없습니다. .env 또는 GitHub Secrets를 확인하세요.`);
  return value;
}
