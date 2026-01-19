export function extractJson(text) {
  if (!text) {
    throw new Error("No text to parse as JSON");
  }
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error("No JSON object found in response");
  }
  const slice = text.slice(first, last + 1);
  return JSON.parse(slice);
}

export function safeJsonStringify(value) {
  return JSON.stringify(value, null, 2);
}
