export interface Lang {
  text: string;
  table?: { columns: string[]; rows: string[][] };
  image?: string;
}

export interface BrowseItem {
  id: string;
  q_no: number;
  format: string;
  body: { en: Lang; hi?: Lang };
  options: { key: "A" | "B" | "C" | "D"; en: Lang; hi?: Lang }[];
  paper: { year: number; session: "june" | "december"; exam_kind: "regular" | "reexam"; shift: number };
  primary: { unit_id: string; topic_id: string | null };
  tags: { unit_id: string; topic_id: string | null }[];
  passage: { en: Lang } | null;
  saved: boolean;
}

export interface Reveal {
  correct_keys: string[];
  answer_status: "provisional" | "final" | "dropped" | "multiple" | "disputed";
  key_source: string | null;
  explanation: {
    summary?: string | null;
    options?: Record<string, string> | null;
    references?: { book: string; page?: string; note?: string }[];
  } | null;
  explanation_status: "none" | "draft" | "verified";
}

export interface TaxonomyUnit {
  id: string;
  number: number;
  name: string;
  topics: { id: string; name: string }[];
}
