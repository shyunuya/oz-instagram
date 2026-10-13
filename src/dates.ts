// 날짜는 모두 한국 시간(KST, +09:00) 달력 기준입니다. 한국은 서머타임이 없습니다.
const day = 86_400_000;
const kstOffset = 9 * 3_600_000;
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (utc: Date) =>
  `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`;

export function isoWeek(date: Date) {
  const kst = new Date(date.getTime() + kstOffset);
  const d = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const week = Math.ceil(((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / day + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad(week)}`;
}

export function weekMonday(week: string) {
  const match = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!match) throw new Error(`주 형식은 2026-W43 같아야 합니다: ${week}`);
  const jan4 = new Date(Date.UTC(Number(match[1]), 0, 4));
  const firstMonday = jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * day;
  return ymd(new Date(firstMonday + (Number(match[2]) - 1) * 7 * day));
}

export function weekIndex(startDate: string, monday: string) {
  return Math.floor((Date.parse(monday) - Date.parse(startDate)) / (7 * day));
}

export function slotTimes(monday: string, times: string[]) {
  const start = Date.parse(monday);
  return Array.from({ length: 7 }, (_, i) => ymd(new Date(start + i * day))).flatMap((date) =>
    times.map((time) => `${date}T${time}:00+09:00`),
  );
}
