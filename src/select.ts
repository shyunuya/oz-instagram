import type { Area } from './config.ts';
import type { KtoPhoto } from './kto.ts';

export type AreaUse = { area: string; at: string };

export function eligible(photos: KtoPhoto[], area: Area, minYear: number, exclude: Set<string>) {
  return photos.filter(
    (photo) =>
      photo.location.includes('서울') &&
      photo.imageUrl &&
      !exclude.has(photo.id) &&
      (area.anyYear || Number(photo.shotMonth.slice(0, 4)) >= minYear),
  );
}

// 제목과 촬영 월이 같은 사진은 같은 촬영 묶음이라 구도가 비슷한 경우가 많습니다(작가가 달라도). 묶음마다 한 장씩 돌아가며 고릅니다.
export function diversify(photos: KtoPhoto[]) {
  const groups = new Map<string, KtoPhoto[]>();
  const newestFirst = photos.toSorted(
    (a, b) => b.shotMonth.localeCompare(a.shotMonth) || b.createdAt.localeCompare(a.createdAt),
  );
  for (const photo of newestFirst) {
    const key = `${photo.title}|${photo.shotMonth}`;
    groups.set(key, [...(groups.get(key) ?? []), photo]);
  }
  const queues = [...groups.values()];
  const ordered: KtoPhoto[] = [];
  for (let round = 0; ordered.length < photos.length; round++) {
    for (const queue of queues) if (queue[round]) ordered.push(queue[round]);
  }
  return ordered;
}

// 최근 cooldownDays 안에 쓴 지역은 빼고, 가장 오래전에 쓴 지역부터 돌려줍니다. 안 쓴 지역은 설정 순서대로 먼저 옵니다.
export function areaOrder(areas: Area[], history: AreaUse[], at: string, cooldownDays: number) {
  const lastUse = (id: string) =>
    history
      .filter((use) => use.area === id)
      .map((use) => Date.parse(use.at))
      .reduce((a, b) => Math.max(a, b), -Infinity);
  const cooldown = cooldownDays * 86_400_000;
  return areas
    .filter((area) => Math.abs(Date.parse(at) - lastUse(area.id)) >= cooldown)
    .toSorted((a, b) => lastUse(a.id) - lastUse(b.id) || 0);
}
