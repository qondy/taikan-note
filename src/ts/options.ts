import { GapLevel, MissionSize, Note } from './types';

export const FIELDS = ['仕事', 'AI・IT', 'お金', '健康', '暮らし', '人間関係', '趣味', '学び', 'その他'];

export const SOURCES = ['AIに聞いた', '記事・動画', '本', '人から聞いた', 'その他'];

export const MISSION_SIZES: { key: MissionSize; label: string; desc: string }[] = [
  { key: 'min5', label: '5分', desc: 'いますぐ試せる' },
  { key: 'day1', label: '1日', desc: '今日の中でやる' },
  { key: 'weekend', label: '週末', desc: 'じっくり体験' },
];

export const MISSION_LABEL: Record<MissionSize, string> = {
  min5: '5分でやってみる',
  day1: '1日でやってみる',
  weekend: '週末にやってみる',
};

export const GAP_LEVELS: { key: GapLevel; label: string; desc: string }[] = [
  { key: 'same', label: '思ったとおり', desc: '知識どおりだった' },
  { key: 'some', label: '少し違った', desc: '細かい差があった' },
  { key: 'big', label: '全然違った', desc: 'やってみて初めてわかった' },
];

export const GAP_LABEL: Record<GapLevel, string> = {
  same: '思ったとおり',
  some: '少し違った',
  big: '全然違った',
};

/** 思いつかないときのヒント（「知ってるけど、やったことはない」の例） */
export const HINTS: { title: string; field: string }[] = [
  { title: '朝に日光を浴びると眠りが深くなる', field: '健康' },
  { title: 'ポモドーロ・テクニックで集中が続く', field: '仕事' },
  { title: 'AIに議事録を要約してもらえる', field: 'AI・IT' },
  { title: '先取り貯金だとお金が貯まる', field: 'お金' },
  { title: '相手の話をオウム返しすると話が弾む', field: '人間関係' },
  { title: 'タスクは書き出すと頭が軽くなる', field: '仕事' },
  { title: 'AIでプレゼンの構成を作れる', field: 'AI・IT' },
  { title: '寝る前のスマホをやめると寝つきが良くなる', field: '健康' },
  { title: 'ふるさと納税で日用品がもらえる', field: 'お金' },
  { title: '作り置きで平日の料理がラクになる', field: '暮らし' },
];

/** 1件の体験で増える経験値 */
export const XP_DONE = 10;
export const XP_GAP = 5;
export const XP_INSIGHT = 5;

export function noteXp(n: Note): number {
  if (n.status !== 'done' || !n.experience) return 0;
  let xp = XP_DONE;
  if (n.experience.gapLevel !== 'same') xp += XP_GAP;
  if (n.experience.insight.trim()) xp += XP_INSIGHT;
  return xp;
}

/** 分野ごとのレベル（30XPごとに1つ上がる） */
export const XP_PER_LEVEL = 30;

/** 累計経験値に応じた称号 */
export const TITLES: { min: number; name: string }[] = [
  { min: 0, name: '知ってる人' },
  { min: 30, name: 'やってみた人' },
  { min: 100, name: '体感した人' },
  { min: 250, name: '語れる人' },
  { min: 500, name: '経験者' },
  { min: 1000, name: '体感の達人' },
];

/** 知ってるだけのまま、この日数を過ぎたら「そろそろ体感しよう」と出す */
export const STALE_DAYS = 14;

/** AIに体験メニューを考えてもらうためのプロンプト */
export function missionPrompt(title: string, knowledge: string): string {
  const lines = [
    '次のことを、知識としては知っていますが、まだ自分で体験したことがありません。',
    '',
    `知っていること：${title}`,
  ];
  if (knowledge.trim()) lines.push(`補足：${knowledge.trim()}`);
  lines.push(
    '',
    'これを実際に「体感」して、自分の言葉で語れるようになるための小さな体験を提案してください。',
    '',
    '# 出力形式',
    '- 5分でできる版・1日でできる版・週末にできる版を1つずつ',
    '- それぞれ「やること」「体感できるポイント（何に注目すればよいか）」を1〜2行で',
    '- 特別な道具やお金がかからないものを優先',
  );
  return lines.join('\n');
}

/** 体験したあとに、AIの答えと自分の体感を比べてもらうためのプロンプト */
export function comparePrompt(n: Note): string {
  const e = n.experience;
  const lines = [
    `「${n.title}」について、実際にやってみました。`,
  ];
  if (n.knowledge.trim()) lines.push('', `事前に知っていたこと：${n.knowledge.trim()}`);
  if (e) {
    lines.push('', `やってみた結果：${e.result.trim() || '（未記入）'}`);
    if (e.gap.trim()) lines.push(`知識と違ったこと：${e.gap.trim()}`);
  }
  lines.push(
    '',
    '一般的な知識と私の体験を比べて、',
    '- なぜ違いが出たと考えられるか',
    '- 次に試すなら、どこを変えるとよいか',
    'を短く教えてください。',
  );
  return lines.join('\n');
}

export const AI_LINKS: { label: string; url: string }[] = [
  { label: 'ChatGPT', url: 'https://chatgpt.com/' },
  { label: 'Claude', url: 'https://claude.ai/new' },
  { label: 'Gemini', url: 'https://gemini.google.com/app' },
];
