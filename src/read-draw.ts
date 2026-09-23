import { readPdfFile } from "./pdf-reader.ts";
import { buildDrawIndex, searchDrawIndex, type DrawSearchMode } from "./team-path-parser.ts";
import { verifyDrawImport } from "./import-verification.ts";
import { buildBrackets } from "./bracket-builder.ts";

/** Pure read/search operation: no upload, persistence, following or scores. */
export async function readDraw(
  file: File,
  query = "",
  mode: DrawSearchMode = "all",
  onProgress?: (page: number, total: number) => void,
) {
  const pages = await readPdfFile(file, onProgress);
  // The existing verifier has no error for an empty pages array.
  if (!pages.length) throw new Error("The PDF contains no usable pages.");
  const index = buildDrawIndex(pages);
  // Always verify the COMPLETE index, never a filtered search result.
  const verification = verifyDrawImport(pages, index);
  const results = searchDrawIndex(index, query, mode);
  const athletes = results.athletes.map((athlete) => ({
    ...athlete,
    verification: verification.athletes[athlete.id] ?? {
      status: "unknown" as const,
      issues: [{ code: "not-assessed", field: "identity" as const, message: "Review this entry against the PDF." }],
    },
  }));
  // Arbres par division pour Taekwondo Score : une division passe en revue si un de ses athlètes n'est pas « recognised ».
  const brackets = buildBrackets(index).map((division) => {
    const unverified = division.entrants.filter((e) => verification.athletes[e.athleteId]?.status !== "recognised").length;
    if (!unverified) return division;
    return { ...division, status: "review" as const,
      issues: [...division.issues, `${unverified} athlète(s) à vérifier selon le contrôle de lecture.`] };
  });
  return { pages, index, verification, brackets, results: { ...results, athletes } };
}
