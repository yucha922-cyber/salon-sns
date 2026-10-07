/**
 * First-party conversions (予約数 / 来店 / 契約 / 応募 / 売上) entered manually
 * or via CSV. Stored separately from Meta-reported conversions and never
 * summed with them: the UI shows "Meta計測" and "自社計測" side by side.
 *
 * CSV columns (header required, order free):
 *   date (YYYY-MM-DD), kind (reservation|lead|visit|contract|application|revenue),
 *   count, revenue (optional), campaign (optional: campaign name or Meta id), note (optional)
 */
import { CONVERSION_KINDS, type ConversionKind } from "./types";

export interface ParsedConversion {
  occurredOn: string;
  kind: ConversionKind;
  count: number;
  revenue: number | null;
  campaign: string;
  note: string;
}

const KIND_ALIASES: Record<string, ConversionKind> = {
  予約: "reservation",
  来店: "visit",
  契約: "contract",
  応募: "application",
  売上: "revenue",
  問い合わせ: "lead",
  リード: "lead",
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseConversionCsv(text: string, maxRows = 1000): { rows: ParsedConversion[]; errors: string[] } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const errors: string[] = [];
  if (!lines.length) return { rows: [], errors: ["CSVが空です"] };
  const header = splitCsvLine(lines[0] as string).map((h) => h.toLowerCase());
  const col = (name: string) => header.indexOf(name);
  if (col("date") < 0 || col("kind") < 0 || col("count") < 0) return { rows: [], errors: ["ヘッダーに date, kind, count が必要です"] };
  const rows: ParsedConversion[] = [];
  for (const [i, line] of lines.slice(1, maxRows + 1).entries()) {
    const cells = splitCsvLine(line);
    const get = (name: string) => (col(name) >= 0 ? (cells[col(name)] ?? "") : "");
    const date = get("date").replaceAll("/", "-");
    const rawKind = get("kind");
    const kind = (CONVERSION_KINDS as readonly string[]).includes(rawKind) ? (rawKind as ConversionKind) : KIND_ALIASES[rawKind];
    const count = Number(get("count") || 0);
    const revenue = get("revenue") ? Number(get("revenue").replace(/[¥,円]/g, "")) : null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
      errors.push(`${i + 2}行目: 日付が不正です（${date}）`);
      continue;
    }
    if (!kind) {
      errors.push(`${i + 2}行目: kindが不正です（${rawKind}）`);
      continue;
    }
    if (!Number.isFinite(count) || count < 0 || count > 100000 || (revenue !== null && (!Number.isFinite(revenue) || revenue < 0))) {
      errors.push(`${i + 2}行目: 数値が不正です`);
      continue;
    }
    rows.push({ occurredOn: date, kind, count, revenue, campaign: get("campaign").slice(0, 200), note: get("note").slice(0, 300) });
  }
  if (lines.length - 1 > maxRows) errors.push(`${maxRows}行を超える分は取り込みませんでした`);
  return { rows, errors };
}
