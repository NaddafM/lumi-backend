export function extractJsonArray(text: string): string | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

export function safeParseJsonArray(text: string): unknown[] | null {
  const sliced = extractJsonArray(text);
  if (!sliced) return null;

  try {
    const parsed = JSON.parse(sliced);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
