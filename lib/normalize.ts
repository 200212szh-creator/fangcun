export function normalizeTitle(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[“”"'‘’]/g, "")
    .replace(/[：:，,。.!！?？、/\\()[\]{}<>《》]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeAuthor(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

export function isbnKey(isbn13?: string | null) {
  return isbn13 ? isbn13.replace(/[^0-9]/g, "") : null;
}
