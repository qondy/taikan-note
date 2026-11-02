import { User } from 'firebase/auth';
import { onAuthChange, loginWithGoogle, logout } from './auth';
import { showToast, openOverlay, closeOverlay, textEl, button } from './ui';
import { submitFeedback } from './feedback';
import { todayKey, labelOf } from './dates';
import {
  FIELDS, SOURCES, MISSION_SIZES, MISSION_LABEL, GAP_LEVELS, GAP_LABEL, HINTS, STALE_DAYS, AI_LINKS,
  missionPrompt, comparePrompt, noteXp,
} from './options';
import {
  subscribeNotes, createNote, updateNote, setMission, saveExperience, clearExperience, deleteNote,
} from './store';
import { convertRate, gapCount, totalXp, titleOf, fieldStats, streak, monthly, ageDays, doneNotes } from './stats';
import { Note, MissionSize, GapLevel, NoteStatus } from './types';
import { initClickTracking } from './analytics';

initClickTracking();

// ============================================================
// DOM refs
// ============================================================
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const loginScreen = $('login-screen');
const appEl = $('app');
const userInfo = $('user-info');
const userAvatar = $<HTMLImageElement>('user-avatar');
const userName = $('user-name');
const btnGoogleLogin = $<HTMLButtonElement>('btn-google-login');
const btnLogout = $<HTMLButtonElement>('btn-logout');

const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.tabs__btn'));
const panels = Array.from(document.querySelectorAll<HTMLElement>('.panel'));
const countNote = $('count-note');
const countShelf = $('count-shelf');

const todayDateEl = $('today-date');
const flowKnown = $('flow-known');
const flowPlanned = $('flow-planned');
const flowDone = $('flow-done');
const plannedList = $('planned-list');
const knownList = $('known-list');

const inputSearch = $<HTMLInputElement>('input-search');
const shelfChips = $('shelf-chips');
const shelfList = $('shelf-list');

const statTitle = $('stat-title');
const statXp = $('stat-xp');
const statTitleFill = $('stat-title-fill');
const statNext = $('stat-next');
const statRate = $('stat-rate');
const statGap = $('stat-gap');
const statStreak = $('stat-streak');
const fieldList = $('field-list');
const monthChart = $('month-chart');

const btnFab = $<HTMLButtonElement>('btn-fab');
const btnAddInline = $<HTMLButtonElement>('btn-add-inline');

const noteOverlay = $('note-modal-overlay');
const noteForm = $<HTMLFormElement>('note-form');
const noteModalTitle = $('note-modal-title');
const inputTitle = $<HTMLInputElement>('input-title');
const inputKnowledge = $<HTMLTextAreaElement>('input-knowledge');
const hintBox = $<HTMLDetailsElement>('hint-box');
const hintChips = $('hint-chips');
const fieldChips = $('field-chips');
const sourceChips = $('source-chips');
const btnNoteSubmit = $<HTMLButtonElement>('btn-note-submit');

const missionOverlay = $('mission-modal-overlay');
const missionLead = $('mission-lead');
const missionAiLinks = $('mission-ai-links');
const sizeOptions = $('size-options');
const inputMission = $<HTMLTextAreaElement>('input-mission');
const btnMissionPrompt = $<HTMLButtonElement>('btn-mission-prompt');
const btnMissionClear = $<HTMLButtonElement>('btn-mission-clear');
const btnMissionSave = $<HTMLButtonElement>('btn-mission-save');

const expOverlay = $('exp-modal-overlay');
const expForm = $<HTMLFormElement>('exp-form');
const expLead = $('exp-lead');
const expKnowledge = $('exp-knowledge');
const inputExpDate = $<HTMLInputElement>('input-exp-date');
const inputResult = $<HTMLTextAreaElement>('input-result');
const gapOptions = $('gap-options');
const gapField = $('gap-field');
const inputGap = $<HTMLTextAreaElement>('input-gap');
const inputInsight = $<HTMLTextAreaElement>('input-insight');
const btnExpSubmit = $<HTMLButtonElement>('btn-exp-submit');

const confirmOverlay = $('confirm-dialog-overlay');
const confirmTitle = $('confirm-dialog-title');
const confirmText = $('confirm-dialog-text');
const btnConfirmCancel = $<HTMLButtonElement>('btn-confirm-cancel');
const btnConfirmOk = $<HTMLButtonElement>('btn-confirm-ok');

const feedbackBtn = $<HTMLButtonElement>('feedback-btn');
const feedbackOverlay = $('feedback-modal-overlay');
const inputFeedbackMessage = $<HTMLTextAreaElement>('input-feedback-message');
const btnFeedbackClose = $<HTMLButtonElement>('btn-feedback-close');
const btnFeedbackSend = $<HTMLButtonElement>('btn-feedback-send');

// ============================================================
// State
// ============================================================
type Tab = 'note' | 'shelf' | 'stats';

interface State {
  uid: string | null;
  unsubscribers: (() => void)[];
  notes: Note[];
  loaded: boolean;
  tab: Tab;
  shelfField: string;
  search: string;
  editingId: string | null;
  formField: string;
  formSource: string;
  missionId: string | null;
  missionSize: MissionSize;
  expId: string | null;
  expGap: GapLevel;
  pending: Set<string>;
  confirmAction: (() => Promise<void>) | null;
}

const state: State = {
  uid: null,
  unsubscribers: [],
  notes: [],
  loaded: false,
  tab: 'note',
  shelfField: 'all',
  search: '',
  editingId: null,
  formField: FIELDS[0],
  formSource: SOURCES[0],
  missionId: null,
  missionSize: 'min5',
  expId: null,
  expGap: 'same',
  pending: new Set(),
  confirmAction: null,
};

// ============================================================
// Helpers
// ============================================================
const findNote = (id: string | null): Note | undefined =>
  (id ? state.notes.find((n) => n.id === id) : undefined);

const byStatus = (s: NoteStatus): Note[] => state.notes.filter((n) => n.status === s);

/** 同じキーの処理が進行中なら何もしない（二重送信防止） */
async function withLock(key: string, fn: () => Promise<void>, errorMessage = '保存に失敗しました。通信環境を確認してください'): Promise<boolean> {
  if (state.pending.has(key)) return false;
  state.pending.add(key);
  renderAll();
  try {
    await fn();
    return true;
  } catch (err) {
    console.error(err);
    showToast(errorMessage);
    return false;
  } finally {
    state.pending.delete(key);
    renderAll();
  }
}

function askConfirm(title: string, text: string, okLabel: string, action: () => Promise<void>): void {
  confirmTitle.textContent = title;
  confirmText.textContent = text;
  btnConfirmOk.textContent = okLabel;
  state.confirmAction = action;
  openOverlay(confirmOverlay);
}

function emptyState(text: string): HTMLElement {
  return textEl('p', 'empty-state', text);
}

async function copyText(text: string, done: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showToast(done);
  } catch {
    // クリップボードAPIが使えない環境向けのフォールバック
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    showToast(ok ? done : 'コピーできませんでした');
  }
}

function aiLinks(container: HTMLElement): void {
  container.replaceChildren();
  AI_LINKS.forEach((l) => {
    const a = document.createElement('a');
    a.href = l.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.className = 'ai-link';
    a.textContent = l.label;
    container.appendChild(a);
  });
}

function pill(text: string, className: string): HTMLElement {
  return textEl('span', className, text);
}

function confirmDelete(n: Note): void {
  askConfirm('削除しますか？', `「${n.title}」を削除します。体験の記録も消え、元に戻せません。`, '削除する', async () => {
    const uid = state.uid;
    if (!uid) return;
    const ok = await withLock(`delete:${n.id}`, () => deleteNote(uid, n.id), '削除に失敗しました');
    if (ok) showToast('削除しました');
  });
}

/** 経験の棚の1枚を、人に語れる形のテキストにする */
function episodeText(n: Note): string {
  const e = n.experience;
  const lines = [`【${n.title}】`];
  if (n.knowledge.trim()) lines.push(`知っていたこと：${n.knowledge.trim()}`);
  if (e) {
    lines.push(`やってみたら：${e.result.trim()}`);
    if (e.gapLevel !== 'same' && e.gap.trim()) lines.push(`違ったこと：${e.gap.trim()}`);
    if (e.insight.trim()) lines.push(`気づき：${e.insight.trim()}`);
    lines.push(`（${labelOf(e.date)}に体験）`);
  }
  return lines.join('\n');
}

// ============================================================
// Render: ノート
// ============================================================
function cardHead(n: Note, extra: HTMLElement[] = []): HTMLElement {
  const head = document.createElement('div');
  head.className = 'item-card__head';
  head.append(pill(n.field, 'item-card__badge'), ...extra);
  return head;
}

function editDeleteLinks(n: Note): HTMLElement[] {
  return [
    button('編集', 'text-btn', () => openNoteModal(n.id)),
    button('削除', 'text-btn', () => confirmDelete(n)),
  ];
}

function plannedCard(n: Note): HTMLElement {
  const card = document.createElement('article');
  card.className = 'item-card item-card--idea item-card--planned';
  const size = n.mission ? MISSION_LABEL[n.mission.size] : '';
  card.appendChild(cardHead(n, size ? [pill(size, 'size-pill')] : []));
  card.appendChild(textEl('h4', 'item-card__title', n.title));
  if (n.mission) {
    const m = document.createElement('div');
    m.className = 'mission-box';
    m.append(textEl('span', 'mission-box__label', 'やること'), textEl('p', 'mission-box__text', n.mission.text));
    card.appendChild(m);
  }
  const actions = document.createElement('div');
  actions.className = 'item-card__actions';
  actions.append(
    button('やってみた！', 'btn btn--primary btn--sm', () => openExpModal(n.id)),
    button('ミッションを変える', 'btn btn--ghost btn--sm', () => openMissionModal(n.id)),
    ...editDeleteLinks(n),
  );
  card.appendChild(actions);
  return card;
}

function knownCard(n: Note): HTMLElement {
  const card = document.createElement('article');
  const age = ageDays(n.createdAt);
  const stale = age >= STALE_DAYS;
  card.className = `item-card item-card--idea${stale ? ' is-stale' : ''}`;
  card.appendChild(cardHead(n, [pill(n.source, 'source-pill')]));
  card.appendChild(textEl('h4', 'item-card__title', n.title));
  if (n.knowledge.trim()) card.appendChild(textEl('p', 'item-card__memo item-card__memo--clamp', n.knowledge));
  card.appendChild(textEl('p', `item-card__meta${stale ? ' is-stale' : ''}`,
    age === 0 ? '今日知ったこと' : stale ? `知ってから${age}日。そろそろ体感してみませんか？` : `知ってから${age}日`));
  const actions = document.createElement('div');
  actions.className = 'item-card__actions';
  actions.append(
    button('体験にする', 'btn btn--primary btn--sm', () => openMissionModal(n.id)),
    button('もう体験した', 'btn btn--ghost btn--sm', () => openExpModal(n.id)),
    ...editDeleteLinks(n),
  );
  card.appendChild(actions);
  return card;
}

function renderNote(): void {
  todayDateEl.textContent = labelOf(todayKey());
  const known = byStatus('known');
  const planned = byStatus('planned');
  flowKnown.textContent = String(known.length);
  flowPlanned.textContent = String(planned.length);
  flowDone.textContent = String(doneNotes(state.notes).length);

  if (!state.loaded) {
    plannedList.replaceChildren(emptyState('読み込み中…'));
    knownList.replaceChildren();
    return;
  }
  plannedList.replaceChildren(...(planned.length
    ? planned.map(plannedCard)
    : [emptyState('まだありません。「知ってるだけ」から「体験にする」を押すと、ここに並びます。')]));

  // 古いもの（そろそろ体感したいもの）を上に
  const sortedKnown = [...known].sort((a, b) => a.createdAt - b.createdAt);
  knownList.replaceChildren(...(sortedKnown.length
    ? sortedKnown.map(knownCard)
    : [emptyState(state.notes.length
      ? '知ってるだけのものはありません。新しく知ったことがあれば書いておきましょう。'
      : 'AIに聞いたこと、記事で読んだこと、人から聞いたこと。「知ってるけど、やったことはない」ものを書いてみましょう。')]));
}

// ============================================================
// Render: 経験の棚
// ============================================================
function episodeRow(label: string, text: string, className = ''): HTMLElement {
  const row = document.createElement('div');
  row.className = `episode__row${className ? ` ${className}` : ''}`;
  row.append(textEl('span', 'episode__label', label), textEl('p', 'episode__text', text));
  return row;
}

function shelfCard(n: Note): HTMLElement {
  const e = n.experience;
  const card = document.createElement('article');
  card.className = 'item-card item-card--idea episode';
  if (!e) return card;
  card.appendChild(cardHead(n, [
    pill(GAP_LABEL[e.gapLevel], `gap-pill gap-pill--${e.gapLevel}`),
    pill(`+${noteXp(n)}XP`, 'xp-pill'),
  ]));
  card.appendChild(textEl('h4', 'item-card__title', n.title));
  card.appendChild(textEl('p', 'item-card__meta', `${labelOf(e.date)}に体験`));
  if (n.knowledge.trim()) card.appendChild(episodeRow('知っていたこと', n.knowledge, 'episode__row--muted'));
  card.appendChild(episodeRow('やってみたら', e.result));
  if (e.gapLevel !== 'same' && e.gap.trim()) card.appendChild(episodeRow('違ったこと', e.gap, 'episode__row--gap'));
  if (e.insight.trim()) card.appendChild(episodeRow('自分だけの気づき', e.insight, 'episode__row--insight'));

  const actions = document.createElement('div');
  actions.className = 'item-card__actions';
  actions.append(
    button('語れる形でコピー', 'btn btn--primary btn--sm', () => void copyText(episodeText(n), 'コピーしました')),
    button('AIと答え合わせ', 'btn btn--ghost btn--sm', () => void copyText(comparePrompt(n), 'AIへの依頼文をコピーしました')),
    button('記録を直す', 'text-btn', () => openExpModal(n.id)),
    button('棚から戻す', 'text-btn', () => askConfirm('「知ってる」に戻しますか？', `「${n.title}」の体験の記録を消して、ノートに戻します。記録は元に戻せません。`, '戻す', async () => {
      const uid = state.uid;
      if (!uid) return;
      const ok = await withLock(`exp:${n.id}`, () => clearExperience(uid, n.id, !!n.mission));
      if (ok) showToast('ノートに戻しました');
    })),
    button('削除', 'text-btn', () => confirmDelete(n)),
  );
  card.appendChild(actions);
  return card;
}

function renderShelf(): void {
  const done = doneNotes(state.notes);
  const fields = FIELDS.filter((f) => done.some((n) => n.field === f));
  if (state.shelfField !== 'all' && !fields.includes(state.shelfField)) state.shelfField = 'all';
  shelfChips.replaceChildren(...[{ key: 'all', label: `すべて ${done.length}` },
    ...fields.map((f) => ({ key: f, label: `${f} ${done.filter((n) => n.field === f).length}` }))]
    .map(({ key, label }) => {
      const b = button(label, `chip${state.shelfField === key ? ' is-active' : ''}`, () => {
        state.shelfField = key;
        renderShelf();
      });
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(state.shelfField === key));
      return b;
    }));
  shelfChips.classList.toggle('hidden', done.length === 0);

  const q = state.search.trim().toLowerCase();
  const list = done
    .filter((n) => state.shelfField === 'all' || n.field === state.shelfField)
    .filter((n) => !q || [n.title, n.knowledge, n.experience?.result, n.experience?.gap, n.experience?.insight]
      .some((t) => (t ?? '').toLowerCase().includes(q)))
    .sort((a, b) => (b.experience?.date ?? '').localeCompare(a.experience?.date ?? '') || b.createdAt - a.createdAt);

  if (!state.loaded) {
    shelfList.replaceChildren(emptyState('読み込み中…'));
    return;
  }
  shelfList.replaceChildren(...(list.length
    ? list.map(shelfCard)
    : [emptyState(done.length
      ? '条件に合う経験はありません。'
      : 'まだ棚は空です。知っていることを1つ体験して「やってみた！」を記録すると、ここに並びます。')]));
}

// ============================================================
// Render: 経験値
// ============================================================
function renderStats(): void {
  const xp = totalXp(state.notes);
  const t = titleOf(xp);
  statTitle.textContent = t.name;
  statXp.textContent = String(xp);
  if (t.next) {
    const ratio = (xp - t.min) / (t.next.min - t.min);
    statTitleFill.style.width = `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`;
    statNext.textContent = `「${t.next.name}」まであと${t.next.min - xp}XP`;
  } else {
    statTitleFill.style.width = '100%';
    statNext.textContent = '最高の称号です。体感の達人！';
  }
  const r = convertRate(state.notes);
  statRate.textContent = r === null ? '-' : `${r}%`;
  statGap.textContent = String(gapCount(state.notes));
  statStreak.textContent = `${streak(state.notes)}日`;

  const fs = fieldStats(state.notes);
  fieldList.replaceChildren(...(fs.length ? fs.map((s) => {
    const row = document.createElement('div');
    row.className = 'field-level';
    const head = document.createElement('div');
    head.className = 'field-level__head';
    head.append(
      textEl('span', 'field-level__name', s.field),
      textEl('span', 'field-level__lv', `Lv.${s.level}`),
      textEl('span', 'field-level__meta', `${s.count}件・${s.xp}XP`),
    );
    const track = document.createElement('div');
    track.className = 'field-level__track';
    const fill = document.createElement('div');
    fill.className = 'field-level__fill';
    fill.style.width = `${Math.round(s.progress * 100)}%`;
    track.appendChild(fill);
    row.append(head, track);
    return row;
  }) : [emptyState('体験を記録すると、分野ごとにレベルが上がっていきます。')]));

  const months = monthly(state.notes);
  const max = Math.max(1, ...months.map((m) => m.count));
  monthChart.replaceChildren(...months.map((m) => {
    const col = document.createElement('div');
    col.className = 'month-chart__col';
    const bar = document.createElement('div');
    bar.className = 'month-chart__bar';
    bar.style.height = `${Math.round((m.count / max) * 100)}%`;
    const barWrap = document.createElement('div');
    barWrap.className = 'month-chart__bar-wrap';
    barWrap.appendChild(bar);
    col.append(textEl('span', 'month-chart__value', String(m.count)), barWrap, textEl('span', 'month-chart__label', m.label));
    return col;
  }));
}

function renderTabs(): void {
  tabButtons.forEach((b) => {
    const on = b.dataset.tab === state.tab;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-selected', String(on));
  });
  panels.forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== state.tab));
}

function renderAll(): void {
  const open = byStatus('known').length + byStatus('planned').length;
  countNote.textContent = open ? String(open) : '';
  const done = doneNotes(state.notes).length;
  countShelf.textContent = done ? String(done) : '';
  renderTabs();
  renderNote();
  renderShelf();
  renderStats();
  btnNoteSubmit.disabled = state.pending.has('note');
  btnExpSubmit.disabled = !!state.expId && state.pending.has(`exp:${state.expId}`);
  btnMissionSave.disabled = !!state.missionId && state.pending.has(`mission:${state.missionId}`);
  btnMissionClear.disabled = btnMissionSave.disabled;
}

// ============================================================
// 知っていることの登録・編集
// ============================================================
function renderChoiceChips(container: HTMLElement, values: string[], current: string, onPick: (v: string) => void): void {
  container.replaceChildren(...values.map((v) => {
    const b = button(v, `chip${v === current ? ' is-active' : ''}`, () => onPick(v));
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(v === current));
    return b;
  }));
}

function renderNoteFormChips(): void {
  renderChoiceChips(fieldChips, FIELDS, state.formField, (v) => { state.formField = v; renderNoteFormChips(); });
  renderChoiceChips(sourceChips, SOURCES, state.formSource, (v) => { state.formSource = v; renderNoteFormChips(); });
}

function renderHints(): void {
  hintChips.replaceChildren(...HINTS.map((h) => button(h.title, 'chip', () => {
    inputTitle.value = h.title;
    state.formField = h.field;
    renderNoteFormChips();
    hintBox.open = false;
    inputKnowledge.focus();
  })));
}

function openNoteModal(id: string | null): void {
  const n = findNote(id);
  state.editingId = n ? n.id : null;
  noteModalTitle.textContent = n ? '知っていることを編集' : '知っていることを書く';
  btnNoteSubmit.textContent = n ? '保存する' : 'ノートに入れる';
  inputTitle.value = n?.title ?? '';
  inputKnowledge.value = n?.knowledge ?? '';
  state.formField = n?.field ?? FIELDS[0];
  state.formSource = n?.source ?? SOURCES[0];
  hintBox.classList.toggle('hidden', !!n);
  hintBox.open = false;
  renderNoteFormChips();
  openOverlay(noteOverlay);
  window.setTimeout(() => inputTitle.focus(), 50);
}

noteForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const uid = state.uid;
  if (!uid) return;
  const title = inputTitle.value.trim();
  if (!title) {
    showToast('知っていることを入力してください');
    return;
  }
  const input = { title, field: state.formField, source: state.formSource, knowledge: inputKnowledge.value.trim() };
  const editingId = state.editingId;
  void withLock('note', async () => {
    if (editingId) await updateNote(uid, editingId, input);
    else await createNote(uid, input);
    closeOverlay(noteOverlay);
    state.editingId = null;
    showToast(editingId ? '保存しました' : 'ノートに入れました。体験に変えてみましょう');
    if (!editingId && state.tab !== 'note') {
      state.tab = 'note';
      window.scrollTo({ top: 0 });
    }
  });
});

const closeNoteModal = (): void => {
  closeOverlay(noteOverlay);
  state.editingId = null;
};
$('btn-note-close').addEventListener('click', closeNoteModal);
$('btn-note-cancel').addEventListener('click', closeNoteModal);

// ============================================================
// 体験ミッション
// ============================================================
function renderSizeOptions(): void {
  sizeOptions.replaceChildren(...MISSION_SIZES.map((s) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `segmented__btn${state.missionSize === s.key ? ' is-active' : ''}`;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(state.missionSize === s.key));
    b.append(textEl('span', 'segmented__label', s.label), textEl('span', 'segmented__desc', s.desc));
    b.addEventListener('click', () => {
      state.missionSize = s.key;
      renderSizeOptions();
    });
    return b;
  }));
}

function openMissionModal(id: string): void {
  const n = findNote(id);
  if (!n) return;
  state.missionId = n.id;
  state.missionSize = n.mission?.size ?? 'min5';
  missionLead.textContent = n.title;
  inputMission.value = n.mission?.text ?? '';
  btnMissionClear.classList.toggle('hidden', !n.mission);
  btnMissionSave.textContent = n.mission ? '保存する' : 'やってみる！';
  renderSizeOptions();
  renderAll();
  openOverlay(missionOverlay);
  window.setTimeout(() => inputMission.focus(), 50);
}

const closeMissionModal = (): void => {
  closeOverlay(missionOverlay);
  state.missionId = null;
};

btnMissionPrompt.addEventListener('click', () => {
  const n = findNote(state.missionId);
  if (!n) return;
  void copyText(missionPrompt(n.title, n.knowledge), 'AIへの依頼文をコピーしました。貼り付けて送ってみましょう');
});

btnMissionSave.addEventListener('click', () => {
  const uid = state.uid;
  const n = findNote(state.missionId);
  if (!uid || !n) return;
  const text = inputMission.value.trim();
  if (!text) {
    showToast('やることを入力してください');
    inputMission.focus();
    return;
  }
  const mission = { size: state.missionSize, text };
  void withLock(`mission:${n.id}`, async () => {
    await setMission(uid, n.id, mission, n.status === 'done');
    closeMissionModal();
    showToast(n.status === 'known' ? '「やってみる」に入れました' : '保存しました');
  });
});

btnMissionClear.addEventListener('click', () => {
  const uid = state.uid;
  const n = findNote(state.missionId);
  if (!uid || !n) return;
  void withLock(`mission:${n.id}`, async () => {
    await setMission(uid, n.id, null, n.status === 'done');
    closeMissionModal();
    showToast('ミッションを外しました');
  });
});

$('btn-mission-close').addEventListener('click', closeMissionModal);

// ============================================================
// 体験の記録
// ============================================================
function renderGapOptions(): void {
  gapOptions.replaceChildren(...GAP_LEVELS.map((g) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `segmented__btn segmented__btn--${g.key}${state.expGap === g.key ? ' is-active' : ''}`;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(state.expGap === g.key));
    b.append(textEl('span', 'segmented__label', g.label), textEl('span', 'segmented__desc', g.desc));
    b.addEventListener('click', () => {
      state.expGap = g.key;
      renderGapOptions();
    });
    return b;
  }));
  gapField.classList.toggle('hidden', state.expGap === 'same');
}

function openExpModal(id: string): void {
  const n = findNote(id);
  if (!n) return;
  state.expId = n.id;
  const e = n.experience;
  expLead.textContent = n.title;
  expKnowledge.textContent = n.mission ? `やること：${n.mission.text}` : '';
  expKnowledge.classList.toggle('hidden', !n.mission);
  inputExpDate.value = e?.date ?? todayKey();
  inputExpDate.max = todayKey();
  inputResult.value = e?.result ?? '';
  inputGap.value = e?.gap ?? '';
  inputInsight.value = e?.insight ?? '';
  state.expGap = e?.gapLevel ?? 'same';
  btnExpSubmit.textContent = e ? '保存する' : '経験の棚に入れる';
  renderGapOptions();
  renderAll();
  openOverlay(expOverlay);
  window.setTimeout(() => inputResult.focus(), 50);
}

const closeExpModal = (): void => {
  closeOverlay(expOverlay);
  state.expId = null;
};

expForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const uid = state.uid;
  const n = findNote(state.expId);
  if (!uid || !n) return;
  const result = inputResult.value.trim();
  const date = inputExpDate.value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    showToast('体験した日を入力してください');
    return;
  }
  if (date > todayKey()) {
    showToast('体験した日は今日までの日付にしてください');
    return;
  }
  if (!result) {
    showToast('実際どうだったかを書いてください');
    inputResult.focus();
    return;
  }
  const wasDone = n.status === 'done';
  const experience = {
    date,
    result,
    gapLevel: state.expGap,
    gap: state.expGap === 'same' ? '' : inputGap.value.trim(),
    insight: inputInsight.value.trim(),
  };
  void withLock(`exp:${n.id}`, async () => {
    await saveExperience(uid, n.id, experience);
    closeExpModal();
    if (wasDone) {
      showToast('保存しました');
    } else {
      const xp = noteXp({ ...n, status: 'done', experience });
      showToast(`体感しました！ +${xp}XP 経験の棚に入りました`);
    }
  });
});

$('btn-exp-close').addEventListener('click', closeExpModal);
$('btn-exp-cancel').addEventListener('click', closeExpModal);

// ============================================================
// 確認ダイアログ
// ============================================================
btnConfirmCancel.addEventListener('click', () => {
  state.confirmAction = null;
  closeOverlay(confirmOverlay);
});

btnConfirmOk.addEventListener('click', () => {
  const action = state.confirmAction;
  state.confirmAction = null;
  closeOverlay(confirmOverlay);
  if (action) void action();
});

// ============================================================
// フィードバック
// ============================================================
feedbackBtn.addEventListener('click', () => {
  openOverlay(feedbackOverlay);
  window.setTimeout(() => inputFeedbackMessage.focus(), 50);
});
btnFeedbackClose.addEventListener('click', () => closeOverlay(feedbackOverlay));

btnFeedbackSend.addEventListener('click', async () => {
  const message = inputFeedbackMessage.value.trim();
  if (!message) {
    showToast('内容を入力してください');
    return;
  }
  if (btnFeedbackSend.disabled) return;
  btnFeedbackSend.disabled = true;
  btnFeedbackSend.textContent = '送信中…';
  const ok = await submitFeedback(message);
  btnFeedbackSend.disabled = false;
  btnFeedbackSend.textContent = '送信する';
  if (ok) {
    inputFeedbackMessage.value = '';
    closeOverlay(feedbackOverlay);
    showToast('送信しました。ありがとうございます！');
  } else {
    showToast('送信に失敗しました。時間をおいて再度お試しください');
  }
});

// オーバーレイの背景クリックで閉じる（確認ダイアログは誤操作防止のため除外）
[noteOverlay, missionOverlay, expOverlay, feedbackOverlay].forEach((overlay) => {
  overlay.addEventListener('click', (e) => {
    if (e.target !== overlay) return;
    if (overlay === noteOverlay) closeNoteModal();
    else if (overlay === missionOverlay) closeMissionModal();
    else if (overlay === expOverlay) closeExpModal();
    else closeOverlay(overlay);
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  closeNoteModal();
  closeMissionModal();
  closeExpModal();
  closeOverlay(feedbackOverlay);
  closeOverlay(confirmOverlay);
  state.confirmAction = null;
});

// ============================================================
// Tabs / buttons
// ============================================================
tabButtons.forEach((b) => b.addEventListener('click', () => {
  state.tab = (b.dataset.tab as Tab) || 'note';
  renderTabs();
  window.scrollTo({ top: 0 });
}));

btnFab.addEventListener('click', () => openNoteModal(null));
btnAddInline.addEventListener('click', () => openNoteModal(null));

inputSearch.addEventListener('input', () => {
  state.search = inputSearch.value;
  renderShelf();
});

// ============================================================
// Auth
// ============================================================
btnGoogleLogin.addEventListener('click', async () => {
  if (btnGoogleLogin.disabled) return;
  btnGoogleLogin.disabled = true;
  try {
    await loginWithGoogle();
  } catch (err) {
    console.error(err);
    const code = (err as { code?: string }).code;
    if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
      showToast('ログインに失敗しました。もう一度お試しください');
    }
  } finally {
    btnGoogleLogin.disabled = false;
  }
});

btnLogout.addEventListener('click', async () => {
  try {
    await logout();
  } catch (err) {
    console.error(err);
    showToast('ログアウトに失敗しました');
  }
});

function stopSubscriptions(): void {
  state.unsubscribers.forEach((u) => u());
  state.unsubscribers = [];
}

onAuthChange((user: User | null) => {
  stopSubscriptions();
  if (!user) {
    state.uid = null;
    state.notes = [];
    state.loaded = false;
    loginScreen.classList.remove('hidden');
    appEl.classList.add('hidden');
    userInfo.classList.add('hidden');
    return;
  }
  state.uid = user.uid;
  loginScreen.classList.add('hidden');
  appEl.classList.remove('hidden');
  userInfo.classList.remove('hidden');
  userAvatar.src = user.photoURL ?? '';
  userAvatar.classList.toggle('hidden', !user.photoURL);
  userName.textContent = user.displayName ?? '';
  renderAll();

  state.unsubscribers.push(subscribeNotes(user.uid, (items) => {
    state.notes = items;
    state.loaded = true;
    renderAll();
  }, (err) => {
    console.error(err);
    showToast('データの読み込みに失敗しました。再読み込みしてください');
  }));
});

renderHints();
aiLinks(missionAiLinks);

// 日付が変わったら「今日」の表示を更新する
let lastDay = todayKey();
window.setInterval(() => {
  const t = todayKey();
  if (t !== lastDay) {
    lastDay = t;
    renderAll();
  }
}, 60 * 1000);
