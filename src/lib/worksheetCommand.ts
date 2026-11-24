// Parses spoken worksheet commands like "send question 2", "push problem two b",
// "send number 4a". Returns null when the phrase has no explicit number, so the
// generic "send question" command still works.
export interface WorksheetCommand {
  number: number;
  part: string;
}

const WORDS: Record<string, number> = {
  one: 1, won: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

const PATTERN =
  /\b(?:send|push|submit)\s+(?:the\s+|a\s+)?(?:question|problem|number|item|exercise)\s+(?:number\s+)?(\d{1,2}|[a-z]+)(?:\s*(?:part\s+)?\(?([a-h])\)?)?\b/i;

export function parseWorksheetCommand(text: string): WorksheetCommand | null {
  if (!text) return null;
  const m = text.toLowerCase().match(PATTERN);
  if (!m) return null;
  let raw = m[1];
  let part = m[2] ?? "";
  // "2a" arrives glued: split digits from a trailing letter
  const glued = raw.match(/^(\d{1,2})([a-h])$/);
  if (glued) { raw = glued[1]; part = glued[2]; }
  const n = /^\d+$/.test(raw) ? parseInt(raw, 10) : WORDS[raw];
  if (!n || n < 1 || n > 99) return null;
  // "to"/"too"/"for" only count as numbers when nothing follows ("send question to students")
  if (["to", "too", "for", "won"].includes(raw)) {
    const after = text.toLowerCase().slice((m.index ?? 0) + m[0].length - (m[2] ? m[0].length - m[0].lastIndexOf(m[2]) : 0));
    if (m[2] || /[a-z]/.test(after)) return null;
  }
  return { number: n, part: part.toLowerCase() };
}

export interface WorksheetItemLite {
  number: number;
  part: string;
}

/** "question 2" sends 2 if it exists, else the first sub-part (2a). */
export function findWorksheetItem<T extends WorksheetItemLite>(items: T[], cmd: WorksheetCommand): T | null {
  const same = items.filter((i) => i.number === cmd.number);
  if (!same.length) return null;
  if (cmd.part) return same.find((i) => i.part === cmd.part) ?? null;
  return same.find((i) => !i.part) ?? [...same].sort((a, b) => a.part.localeCompare(b.part))[0];
}

/** Spoken-name suggestion: "worksheet 4" / title words in recent speech. */
export function suggestWorksheet<T extends { id: string; title: string }>(sheets: T[], speech: string): T | null {
  const s = speech.toLowerCase();
  if (!/\b(worksheet|problem set|handout|sheet|homework)\b/.test(s)) return null;
  const num = s.match(/\b(?:worksheet|problem set|handout|sheet)\s+(?:number\s+)?(\d{1,2})\b/)?.[1];
  let best: T | null = null;
  let bestScore = 0;
  for (const sh of sheets) {
    const t = sh.title.toLowerCase();
    let score = 0;
    if (num && new RegExp(`\\b${num}\\b`).test(t)) score += 2;
    const words = t.split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !/^(worksheet|sheet|problem|pdf|docx)$/.test(w));
    score += words.filter((w) => s.includes(w)).length;
    if (score > bestScore) { bestScore = score; best = sh; }
  }
  return bestScore >= 2 ? best : null;
}
