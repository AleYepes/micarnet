import stringSimilarity from "string-similarity";

const DIACRITICS_REGEX = /[\u0300-\u036f]/g;
const INVERSION_REGEX = /^(.*)[\s,]+\(?(\w{1,3}|illes)\)?$/;
const SPECIAL_CHARS_REGEX = /[()\-//]/g;
const MULTI_SPACE_REGEX = /\s+/g;

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
  const normalized = normalize(name);
  if (!normalized) {
    return [];
  }
  if (!normalized.includes("/")) {
    return [normalized];
  }
  return [normalized, ...normalized.split("/").map((v) => v.trim())];
}
