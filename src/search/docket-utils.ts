/**
 * Backend Docket and Case Format Validator & Utility
 */

export const CASE_DOCKET_REGEX =
  /^(?:\d+:)?\d+-(?:cv|cr|md|mc|bk|ap|ca|cp|civ|cr-|\w{2,4})-\d+(?:-[a-zA-Z0-9]+)?$|^\d+:\d+-[a-zA-Z]+-\d+|^\d{2,4}-\d{3,6}$/i;

export function isCaseDocketQuery(query: string): boolean {
  if (!query) return false;
  const trimmed = query.trim();
  if (trimmed.length < 4) return false;

  if (CASE_DOCKET_REGEX.test(trimmed)) return true;

  const normalized = trimmed
    .toLowerCase()
    .replace(/^docket\s*#?:?\s*/i, '')
    .replace(/^case\s*#?:?\s*/i, '');

  return CASE_DOCKET_REGEX.test(normalized) || /^\d+:\d+-[a-z]+-\d+/i.test(normalized);
}

export function cleanDocketQuery(query: string): string {
  if (!query) return '';
  return query
    .trim()
    .replace(/^docket\s*#?:?\s*/i, '')
    .replace(/^case\s*#?:?\s*/i, '')
    .trim();
}
