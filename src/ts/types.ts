/** known=知ってるだけ / planned=やってみる予定 / done=体感した */
export type NoteStatus = 'known' | 'planned' | 'done';

/** 体験ミッションの大きさ */
export type MissionSize = 'min5' | 'day1' | 'weekend';

/** 知識と体感のズレ。same=思ったとおり / some=少し違った / big=全然違った */
export type GapLevel = 'same' | 'some' | 'big';

export interface Mission {
  size: MissionSize;
  text: string;
}

export interface Experience {
  /** 体験した日 YYYY-MM-DD */
  date: string;
  /** 実際どうだったか */
  result: string;
  gapLevel: GapLevel;
  /** AIの答え・聞いた話と違ったこと */
  gap: string;
  /** 自分だけの気づき（一次情報） */
  insight: string;
}

/** users/{uid}/notes/{id} */
export interface Note {
  id: string;
  /** 知っていること（ひとことで） */
  title: string;
  field: string;
  source: string;
  /** AIの答えや記事の要点 */
  knowledge: string;
  mission: Mission | null;
  experience: Experience | null;
  status: NoteStatus;
  createdAt: number;
}
