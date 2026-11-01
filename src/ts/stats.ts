import { Note } from './types';
import { noteXp, TITLES, XP_PER_LEVEL } from './options';
import { addDays, todayKey } from './dates';

export const doneNotes = (notes: Note[]): Note[] => notes.filter((n) => n.status === 'done' && n.experience);

/** 「知ってる」を「体感した」に変えた割合（%） */
export function convertRate(notes: Note[]): number | null {
  if (!notes.length) return null;
  return Math.round((doneNotes(notes).length / notes.length) * 100);
}

export function gapCount(notes: Note[]): number {
  return doneNotes(notes).filter((n) => n.experience && n.experience.gapLevel !== 'same').length;
}

export function totalXp(notes: Note[]): number {
  return notes.reduce((sum, n) => sum + noteXp(n), 0);
}

export function titleOf(xp: number): { name: string; min: number; next: { min: number; name: string } | null } {
  let idx = 0;
  TITLES.forEach((t, i) => { if (xp >= t.min) idx = i; });
  return { name: TITLES[idx].name, min: TITLES[idx].min, next: TITLES[idx + 1] ?? null };
}

export interface FieldStat {
  field: string;
  xp: number;
  count: number;
  level: number;
  /** 次のレベルまでの進み具合 0〜1 */
  progress: number;
}

export function fieldStats(notes: Note[]): FieldStat[] {
  const map = new Map<string, FieldStat>();
  doneNotes(notes).forEach((n) => {
    const s = map.get(n.field) ?? { field: n.field, xp: 0, count: 0, level: 1, progress: 0 };
    s.xp += noteXp(n);
    s.count += 1;
    map.set(n.field, s);
  });
  return [...map.values()]
    .map((s) => ({ ...s, level: 1 + Math.floor(s.xp / XP_PER_LEVEL), progress: (s.xp % XP_PER_LEVEL) / XP_PER_LEVEL }))
    .sort((a, b) => b.xp - a.xp || b.count - a.count);
}

/** 体験した日が続いている日数（今日か昨日まで続いていれば有効） */
export function streak(notes: Note[]): number {
  const days = new Set(doneNotes(notes).map((n) => n.experience?.date ?? ''));
  let cur = todayKey();
  if (!days.has(cur)) cur = addDays(cur, -1);
  let count = 0;
  while (days.has(cur)) {
    count += 1;
    cur = addDays(cur, -1);
  }
  return count;
}

/** 直近の月ごとの体験数（古い順） */
export function monthly(notes: Note[], months = 6): { key: string; label: string; count: number }[] {
  const now = new Date();
  const list: { key: string; label: string; count: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    list.push({ key, label: `${d.getMonth() + 1}月`, count: 0 });
  }
  doneNotes(notes).forEach((n) => {
    const m = list.find((x) => n.experience && n.experience.date.startsWith(x.key));
    if (m) m.count += 1;
  });
  return list;
}

/** 作成してからの日数 */
export function ageDays(createdAt: number): number {
  return Math.max(0, Math.floor((Date.now() - createdAt) / 86400000));
}
