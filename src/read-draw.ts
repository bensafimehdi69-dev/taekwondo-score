import { readPdfFile } from "./pdf-reader.ts";
import { buildDrawIndex, searchDrawIndex, type DrawSearchMode } from "./team-path-parser.ts";
import { verifyDrawImport, type ImportVerification } from "./import-verification.ts";
import { buildBrackets, type BracketDivision } from "./bracket-builder.ts";

/**
 * Reporte le contrôle de lecture sur chaque division : elle passe en revue si un de ses athlètes n'est pas « recognised ».
 * « Contestants » compte toute la division : sur un tableau coupé en plusieurs pages, l'écart page par page
 * disparaît seulement si la division raccordée a exactement le nombre annoncé.
 */
export function withReadingChecks(divisions: BracketDivision[], verification: ImportVerification): BracketDivision[] {
  const declaredByPage = new Map(verification.pages.map((page) => [page.page, page.expectedCount]));
  return divisions.map((division) => {
    const declared = [...new Set(division.pages.map((page) => declaredByPage.get(page)).filter((n) => n !== undefined))];
    const countMatches = division.pages.length > 1 && declared.length === 1 && declared[0] === division.size;
    const unverified = division.entrants.filter((e) => {
      const check = verification.athletes[e.athleteId];
      if (check?.status === "recognised") return false;
      return !check || !countMatches || check.issues.some((issue) => issue.code !== "count-mismatch");
    }).length;
    const issues = [...division.issues];
    if (division.pages.length > 1 && declared.length === 1 && !countMatches) {
      issues.push(`${division.size} athlètes lus sur les pages ${division.pages.join(", ")}, ${declared[0]} annoncés sur la feuille.`);
    }
    if (unverified) issues.push(`${unverified} athlète(s) à vérifier selon le contrôle de lecture.`);
    return issues.length === division.issues.length ? division : { ...division, status: "review" as const, issues };
  });
}

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
  // Arbres par division pour Taekwondo Score, avec le contrôle de lecture reporté sur chaque division.
  const brackets = withReadingChecks(buildBrackets(index), verification);
  return { pages, index, verification, brackets, results: { ...results, athletes } };
}
