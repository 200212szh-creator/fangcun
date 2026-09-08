import type { BookCandidate } from "@/lib/types";
import { normalizeAuthor, normalizeTitle } from "@/lib/normalize";

export function scoreCandidate(query: string, candidate: Pick<BookCandidate, "title" | "authors" | "description" | "coverUrl">) {
  const q = normalizeTitle(query);
  const title = normalizeTitle(candidate.title);
  let score = title === q ? 1 : title.startsWith(q) ? 0.92 : title.includes(q) ? 0.78 : 0.3;
  if (candidate.authors.length > 0 && normalizeAuthor(candidate.authors.join(" ")).includes(q)) score += 0.08;
  if (candidate.description) score += 0.03;
  if (candidate.coverUrl) score += 0.03;
  return Math.min(0.99, Number(score.toFixed(2)));
}

export function rankCandidates(query: string, candidates: BookCandidate[]) {
  return [...candidates].sort((a, b) => scoreCandidate(query, b) - scoreCandidate(query, a));
}
