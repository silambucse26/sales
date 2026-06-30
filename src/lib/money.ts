const MONEY_WORDS = /\b(amount|budget|deal|expected|inr|money|order|pipeline|price|quote|quotation|rate|revenue|rs|sale|target|value|worth)\b/i;

function parseNumberToken(value: string) {
  const normalized = value.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function parseMoneyToINR(input: unknown): number | null {
  if (input === null || input === undefined || input === "") return null;
  if (typeof input === "number") return Number.isFinite(input) && input > 0 ? Math.round(input) : null;

  const text = String(input);
  const lower = text.toLowerCase();
  const matches = Array.from(
    lower.matchAll(
      /(?:rs\.?|inr|₹)?\s*([0-9]+(?:,[0-9]{2,3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)\s*(crores?|cr|lakhs?|lacs?|lac|l|thousands?|k)?/gi
    )
  );
  let best: number | null = null;

  for (const match of matches) {
    const rawNumber = match[1];
    const unit = match[2]?.toLowerCase();
    const n = parseNumberToken(rawNumber);
    if (!n || n <= 0) continue;

    const before = lower.slice(Math.max(0, match.index - 24), match.index);
    const after = lower.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 24);
    const hasCurrencyPrefix = /\b(rs\.?|inr)$/.test(before.trim()) || /₹/.test(match[0]);
    const hasMoneyContext = MONEY_WORDS.test(before) || MONEY_WORDS.test(after);

    let rupees: number | null = null;
    if (unit && ["crore", "crores", "cr"].includes(unit)) rupees = n * 10000000;
    else if (unit && ["lakh", "lakhs", "lac", "lacs", "l"].includes(unit)) rupees = n * 100000;
    else if (unit && ["thousand", "thousands", "k"].includes(unit)) rupees = n * 1000;
    else if (hasCurrencyPrefix || hasMoneyContext || rawNumber.includes(",")) rupees = n;

    if (rupees !== null) best = Math.max(best ?? 0, Math.round(rupees));
  }

  return best && best > 0 ? best : null;
}

export function coerceMoneyToINR(value: unknown, fallbackText?: string | null): number {
  const fromValue = parseMoneyToINR(value);
  const fromText = parseMoneyToINR(fallbackText);
  return Math.max(fromValue ?? 0, fromText ?? 0);
}
