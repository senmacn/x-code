export function truncate(text: string, max: number) {
  return text.length > max ? text.slice(0, max - 3) + "..." : text;
}