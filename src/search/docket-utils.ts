/**
 * Backend Docket and Case Format Validator & Supreme Court Citation Utility
 */

// Strict Regex for standard Supreme Court U.S. Reports citations: e.g. "469 U.S. 528", "421 U.S. 773"
export const US_REPORTER_CITATION_REGEX = /^\d+\s+U\.S\.\s+\d+$/i;

// Broader Federal/State Reporter Citations: e.g. "123 S. Ct. 456", "987 F.3d 654", "456 F.Supp.2d 123"
export const GENERAL_REPORTER_CITATION_REGEX =
  /^\d+\s+(?:U\.S\.|S\.\s*Ct\.|F\.(?:2d|3d|Supp\.?2d|Supp\.?3d|Supp\.?|App\'?x)?|L\.\s*Ed\.(?:2d)?|Wall\.|Wheat\.|Cranch|Pet\.)\s+\d+$/i;

export const CASE_DOCKET_REGEX =
  /^(?:\d+:)?\d+-(?:cv|cr|md|mc|bk|ap|ca|cp|civ|cr-|\w{2,4})-\d+(?:-[a-zA-Z0-9]+)?$|^\d+:\d+-[a-zA-Z]+-\d+|^\d{2,4}-\d{3,6}$/i;

export function isCitationQuery(query: string): boolean {
  if (!query) return false;
  const trimmed = query.trim();
  return US_REPORTER_CITATION_REGEX.test(trimmed) || GENERAL_REPORTER_CITATION_REGEX.test(trimmed);
}

export function parseCitationParts(query: string): { volume: string; reporter: string; page: string } | null {
  if (!query) return null;
  const trimmed = query.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 3) {
    const volume = parts[0];
    const page = parts[parts.length - 1];
    const reporter = parts.slice(1, parts.length - 1).join(' ');
    return { volume, reporter, page };
  }
  return null;
}

/**
 * Dynamically determines the historical / filing year from a docket or citation string
 */
export function extractHistoricalYear(input: string, fallbackDate?: string | null): number {
  if (!input) return 2021;
  const trimmed = input.trim();

  // 1. Supreme Court Citation Volume curve: e.g. "469 U.S. 528" -> 1985
  const citParts = parseCitationParts(trimmed);
  if (citParts && /^\d+$/.test(citParts.volume)) {
    const vol = parseInt(citParts.volume, 10);
    if (vol <= 600 && vol >= 1) {
      if (vol <= 100) return Math.round(1790 + (vol / 100) * 85);
      if (vol <= 300) return Math.round(1875 + ((vol - 100) / 200) * 62);
      if (vol <= 500) return Math.round(1937 + ((vol - 300) / 200) * 54); // Vol 469 -> 1985
      return Math.round(1991 + ((vol - 500) / 100) * 33);
    }
  }

  // 2. 4-digit year in string: e.g. "1980-cv-02150"
  const fourDigitMatch = trimmed.match(/\b(19\d{2}|20\d{2})\b/);
  if (fourDigitMatch) {
    return parseInt(fourDigitMatch[1], 10);
  }

  // 3. 2-digit year in docket code: e.g. "1:80-cv-02150" -> 80 -> 1980
  const twoDigitMatch = trimmed.match(/(?::|^)(\d{2})-(?:cv|cr|md|mc|bk|ap|ca|cp|civ|\w{2,4})-/i);
  if (twoDigitMatch) {
    const yr2 = parseInt(twoDigitMatch[1], 10);
    return yr2 >= 45 ? 1900 + yr2 : 2000 + yr2;
  }

  // 4. Check fallback date
  if (fallbackDate) {
    const parsed = new Date(fallbackDate);
    if (!isNaN(parsed.getTime())) {
      return parsed.getFullYear();
    }
  }

  return 2021;
}

export function isCaseDocketQuery(query: string): boolean {
  if (!query) return false;
  const trimmed = query.trim();
  if (trimmed.length < 3) return false;

  if (isCitationQuery(trimmed)) return true;
  if (CASE_DOCKET_REGEX.test(trimmed)) return true;

  const normalized = trimmed
    .toLowerCase()
    .replace(/^docket\s*#?:?\s*/i, '')
    .replace(/^case\s*#?:?\s*/i, '');

  return (
    isCitationQuery(normalized) ||
    CASE_DOCKET_REGEX.test(normalized) ||
    /^\d+:\d+-[a-z]+-\d+/i.test(normalized)
  );
}

export function cleanDocketQuery(query: string): string {
  if (!query) return '';
  return query
    .trim()
    .replace(/^docket\s*#?:?\s*/i, '')
    .replace(/^case\s*#?:?\s*/i, '')
    .trim();
}

