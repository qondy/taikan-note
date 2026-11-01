import {
  collection, doc, onSnapshot, setDoc, addDoc, deleteDoc, deleteField, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { Note, NoteStatus, Mission, Experience, MissionSize, GapLevel } from './types';
import { FIELDS, SOURCES } from './options';

const STATUSES: NoteStatus[] = ['known', 'planned', 'done'];
const SIZES: MissionSize[] = ['min5', 'day1', 'weekend'];
const GAPS: GapLevel[] = ['same', 'some', 'big'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const millis = (v: unknown): number =>
  (v && typeof (v as { toMillis?: unknown }).toMillis === 'function'
    ? (v as { toMillis: () => number }).toMillis() : Date.now());

const notesCol = (uid: string) => collection(db, 'users', uid, 'notes');
const noteDoc = (uid: string, id: string) => doc(db, 'users', uid, 'notes', id);

function parseMission(v: unknown): Mission | null {
  if (!v || typeof v !== 'object') return null;
  const m = v as Record<string, unknown>;
  const text = str(m.text);
  if (!text) return null;
  return { size: SIZES.includes(m.size as MissionSize) ? m.size as MissionSize : 'min5', text };
}

function parseExperience(v: unknown): Experience | null {
  if (!v || typeof v !== 'object') return null;
  const e = v as Record<string, unknown>;
  if (typeof e.date !== 'string' || !DATE_RE.test(e.date)) return null;
  return {
    date: e.date,
    result: str(e.result),
    gapLevel: GAPS.includes(e.gapLevel as GapLevel) ? e.gapLevel as GapLevel : 'same',
    gap: str(e.gap),
    insight: str(e.insight),
  };
}

export function subscribeNotes(
  uid: string,
  onData: (items: Note[]) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(notesCol(uid), (snap) => {
    const list: Note[] = [];
    snap.forEach((d) => {
      const data = d.data();
      if (typeof data.title !== 'string') return;
      const experience = parseExperience(data.experience);
      let status: NoteStatus = STATUSES.includes(data.status) ? data.status : 'known';
      if (status === 'done' && !experience) status = 'known';
      list.push({
        id: d.id,
        title: data.title,
        field: FIELDS.includes(data.field) ? data.field : 'その他',
        source: SOURCES.includes(data.source) ? data.source : 'その他',
        knowledge: str(data.knowledge),
        mission: parseMission(data.mission),
        experience,
        status,
        createdAt: millis(data.createdAt),
      });
    });
    list.sort((a, b) => b.createdAt - a.createdAt);
    onData(list);
  }, onError);
}

export interface NoteInput {
  title: string;
  field: string;
  source: string;
  knowledge: string;
}

export async function createNote(uid: string, input: NoteInput): Promise<void> {
  await addDoc(notesCol(uid), {
    ...input,
    status: 'known',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function updateNote(uid: string, id: string, input: NoteInput): Promise<void> {
  return setDoc(noteDoc(uid, id), { ...input, updatedAt: serverTimestamp() }, { merge: true });
}

/** 体験ミッションを決める（体感済みのものは状態を変えない） */
export function setMission(uid: string, id: string, mission: Mission | null, keepDone: boolean): Promise<void> {
  const data: Record<string, unknown> = {
    mission: mission ?? deleteField(),
    updatedAt: serverTimestamp(),
  };
  if (!keepDone) data.status = mission ? 'planned' : 'known';
  return setDoc(noteDoc(uid, id), data, { merge: true });
}

export function saveExperience(uid: string, id: string, experience: Experience): Promise<void> {
  return setDoc(noteDoc(uid, id), {
    experience,
    status: 'done',
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/** 体験の記録を消して「知ってる」側に戻す */
export function clearExperience(uid: string, id: string, hasMission: boolean): Promise<void> {
  return setDoc(noteDoc(uid, id), {
    experience: deleteField(),
    status: hasMission ? 'planned' : 'known',
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export function deleteNote(uid: string, id: string): Promise<void> {
  return deleteDoc(noteDoc(uid, id));
}
