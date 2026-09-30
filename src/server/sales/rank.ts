/** The best matches for the words asked about, by how many of them each document mentions (the title counts more). */
export function rank<T extends { title: string; text: string }>(docs: T[], query: string, limit = 4): T[] {
  const words = [...new Set(query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])];
  if (!words.length) return [];
  return docs
    .map((d) => {
      const title = d.title.toLowerCase();
      const body = d.text.toLowerCase();
      return { d, score: words.reduce((s, w) => s + (title.includes(w) ? 3 : 0) + (body.includes(w) ? 1 : 0), 0) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.d);
}
