export type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Array<string | number | boolean | null | undefined>;

export type QueryParams = Record<string, QueryValue>;

/**
 * Build a URL query string from a params object.
 * - Skips null/undefined values
 * - Joins array values using comma
 * - Encodes keys and values with encodeURIComponent
 */
export function buildQueryString(params: QueryParams): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;

    const encodedKey = encodeURIComponent(key);

    if (Array.isArray(value)) {
      const filtered = value.filter((v) => v !== undefined && v !== null);
      if (filtered.length === 0) continue;
      const joined = filtered.map(String).join(',');
      parts.push(`${encodedKey}=${encodeURIComponent(joined)}`);
    } else {
      parts.push(`${encodedKey}=${encodeURIComponent(String(value))}`);
    }
  }

  return parts.join('&');
}
