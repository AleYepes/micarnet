import stringSimilarity from "string-similarity";

const DIACRITICS_REGEX = /[\u0300-\u036f]/g;
const INVERSION_REGEX = /^(.*?)[\s,]+\(?(\w{1,3}|illes)\)?$/;
const SPECIAL_CHARS_REGEX = /[()\-//]/g;
const MULTI_SPACE_REGEX = /\s+/g;
const PARENTHETICAL_REGEX = /^(.*)\(([^)]+)\)(.*)$/;

export function normalize(text: string) {
  if (!text || text.toUpperCase() === "N.D" || text.toUpperCase() === "N.D.") {
    return "";
  }
  let normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_REGEX, "");

  // Handle inversions like "Coruña (A)", "Palmas, Las", "Balears (Illes)"
  normalized = normalized.replace(INVERSION_REGEX, "$2 $1");

  return normalized
    .replace(SPECIAL_CHARS_REGEX, " ")
    .replace(MULTI_SPACE_REGEX, " ")
    .trim();
}

export function cleanMuniName(name: string): string {
  if (!name) {
    return "";
  }
  return name
    .replace(/\( municipio sin especificar\)/gi, "")
    .replace(/ municipio sin especificar/gi, "")
    .trim();
}

export function isSmartMatch(
  normalizedSource: string,
  normalizedTarget: string
): boolean {
  if (normalizedSource === normalizedTarget) {
    return true;
  }

  const sourceWords = normalizedSource.split(" ").filter((w) => w.length > 2);
  const targetWords = normalizedTarget.split(" ").filter((w) => w.length > 2);

  if (sourceWords.length === 0 || targetWords.length === 0) {
    return (
      stringSimilarity.compareTwoStrings(normalizedSource, normalizedTarget) >
      0.7
    );
  }

  const [shorter, longer] =
    sourceWords.length < targetWords.length
      ? [sourceWords, targetWords]
      : [targetWords, sourceWords];

  const allWordsMatch = shorter.every((sw) =>
    longer.some((lw) => lw === sw || lw.includes(sw) || sw.includes(lw))
  );
  if (allWordsMatch) {
    return true;
  }

  return (
    stringSimilarity.compareTwoStrings(normalizedSource, normalizedTarget) > 0.6
  );
}

export function getNameVariants(name: string): string[] {
  if (!name) {
    return [];
  }

  const rawCandidates = new Set([name]);
  for (const part of name.split("/")) {
    rawCandidates.add(part);
  }

  const parenthetical = name.match(PARENTHETICAL_REGEX);
  if (parenthetical) {
    const before = parenthetical[1] ?? "";
    const inside = parenthetical[2] ?? "";
    const after = parenthetical[3] ?? "";
    const withoutParentheses = `${before} ${after}`.trim();
    const parentheticalFirst = `${inside} ${before} ${after}`.trim();
    const parentheticalLast = `${before} ${inside} ${after}`.trim();
    rawCandidates.add(withoutParentheses);
    rawCandidates.add(parentheticalFirst);
    rawCandidates.add(parentheticalLast);
    rawCandidates.add(inside);
  }

  const variants = new Set<string>();
  for (const candidate of rawCandidates) {
    const normalized = normalize(candidate);
    if (normalized) {
      variants.add(normalized);
    }
  }

  return [...variants];
}
