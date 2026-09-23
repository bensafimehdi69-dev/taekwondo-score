import { extractMarkers, normalizeDrawText, type TeamAthlete, type TeamDrawAnalysis } from "./team-path-parser.ts";

import type { ParsedPage } from "./types.ts";

export type ImportStatus = "recognised" | "review" | "unknown";

export type ImportIssue = { code: string; field: "page" | "identity" | "category" | "path"; message: string };

export type PageVerification = {
  page: number; status: ImportStatus; format: string; athleteCount: number;
  expectedCount?: number; fightCodes: string[]; issues: ImportIssue[];
};

export type AthleteVerification = { status: ImportStatus; issues: ImportIssue[] };

export type ImportVerification = { status: ImportStatus; pages: PageVerification[]; athletes: Record<string, AthleteVerification> };

function hasCycle(edges: Map<string, Set<string>>): boolean {
  const visited = new Set<string>();
  const active = new Set<string>();
  const visit = (code: string): boolean => {
    if (active.has(code)) return true;
    if (visited.has(code)) return false;
    active.add(code);
    for (const next of edges.get(code) ?? []) if (visit(next)) return true;
    active.delete(code); visited.add(code);
    return false;
  };
  return [...edges.keys()].some(visit);
}

export function verifyDrawImport(pages: ParsedPage[], index: TeamDrawAnalysis): ImportVerification {
  const assessments: Record<string, AthleteVerification> = {};
  const pageReports = pages.map((page): PageVerification => {
    const athletes = index.athletes.filter((athlete) => athlete.page === page.pageNumber);
    const issues: ImportIssue[] = [];
    const taekoplan = athletes.length > 0 && athletes.every((athlete) => athlete.drawFormat === "taekoplan");
    const seeded = athletes.length > 0 && athletes.every((athlete) => athlete.drawFormat === "wt");
    const recognised = taekoplan || seeded;
    const format = taekoplan ? "TaekoPlan-style bracket" : seeded ? "Name / country bracket" : "Unknown layout";
    const expected = page.rawText.match(/\bContestants\s*:?\s*(\d+)/i);
    const expectedCount = expected ? Number(expected[1]) : undefined;
    const fightCodes = [...new Set(extractMarkers(page).map((marker) => marker.code))];
    if (!recognised) issues.push({ code: "unknown-format", field: "page", message: "No supported participant layout was identified. Check the source page and enter athletes manually if needed." });
    if (expectedCount !== undefined && expectedCount !== athletes.length) issues.push({ code: "count-mismatch", field: "page",
      message: `${athletes.length} names found; the header lists ${expectedCount} contestants. Check missing or repeated names, withdrawals and disqualifications. No names have been removed to force a match.` });
    if (page.extractionMethod === "ocr" || (page.extractionConfidence ?? 0) < 0.6 || page.extractionWarnings?.length) issues.push({ code: "text-quality", field: "page", message: "The text required OCR or contains reading uncertainties. Check the names and numbers against the PDF." });
    if (/\b(?:repechage|repêchage|round robin|swiss system)\b/i.test(page.rawText)) issues.push({ code: "alternative-bracket", field: "page", message: "This page may include a repechage or non-elimination format. Automatic paths and round labels require manual review." });
    const edges = new Map<string, Set<string>>();
    const predecessors = new Map<string, Set<string>>();
    for (const athlete of athletes) athlete.path.forEach((code, i) => {
      const next = athlete.path[i + 1];
      if (!next) return;
      if (!edges.has(code)) edges.set(code, new Set());
      if (!predecessors.has(next)) predecessors.set(next, new Set());
      edges.get(code)!.add(next); predecessors.get(next)!.add(code);
    });
    if ([...edges.values()].some((next) => next.size > 1) || [...predecessors.values()].some((prior) => prior.size > 2) || hasCycle(edges)) issues.push({ code: "branch-conflict", field: "page", message: "Some inferred bracket connections conflict. Review the full paths; they must not be accepted automatically." });
    const finals = new Set(athletes.map((athlete) => athlete.path.at(-1)).filter(Boolean));
    if (finals.size > 1) issues.push({ code: "multiple-finals", field: "page", message: "The inferred paths do not reach the same final. This may be a multi-table page or an incorrect connection." });
    const linkedCodes = new Set(athletes.flatMap((athlete) => athlete.path));
    const unlinkedCodes = fightCodes.filter((code) => !linkedCodes.has(code));
    if (recognised && unlinkedCodes.length) issues.push({ code: "unlinked-fights", field: "page", message: `Some fight boxes were not linked to any athlete: ${unlinkedCodes.join(", ")}. Check for an incomplete bracket or an incorrect connection.` });
    const names = new Map<string, number>();
    for (const athlete of athletes) {
      const key = normalizeDrawText(athlete.name);
      names.set(key, (names.get(key) ?? 0) + 1);
    }
    for (const athlete of athletes) {
      const athleteIssues = [...issues];
      const add = (code: string, field: ImportIssue["field"], message: string) => athleteIssues.push({ code, field, message });
      if (!athlete.name.trim() || /[?�]|\b(?:TEAM|CLUB|DSQ|PTF)\b/i.test(athlete.name)) add("identity-uncertain", "identity", "The athlete name may contain a club, result or unreadable characters.");
      if ((names.get(normalizeDrawText(athlete.name)) ?? 0) > 1) add("same-name", "identity", "Several entries have this name. Check the club and bracket position; they may be different athletes.");
      if (!athlete.ageCategory || !athlete.weightCategory || /To confirm/i.test(athlete.category) || athlete.genderCategory === "Open") add("category-missing", "category", "One or more category fields could not be identified.");
      if (!athlete.path.length) add("path-missing", "path", "No fight path was found.");
      if (new Set(athlete.path).size !== athlete.path.length) add("path-repeated", "path", "A fight is repeated within this athlete's path.");
      if (athlete.path.some((code) => !fightCodes.includes(code))) add("fight-not-on-page", "path", "A proposed fight number was not found in a fight box on this page.");
      assessments[athlete.id] = { status: !recognised ? "unknown" : athleteIssues.length ? "review" : "recognised", issues: athleteIssues };
    }
    const entryIssues = athletes.flatMap((athlete) => assessments[athlete.id].issues.filter((issue) => issue.field !== "page").map((issue) => ({ ...issue, code: `${athlete.id}:${issue.code}`, message: `${athlete.name}: ${issue.message}` })));
    return { page: page.pageNumber, status: !recognised ? "unknown" : issues.length || entryIssues.length ? "review" : "recognised",
      format, athleteCount: athletes.length, expectedCount, fightCodes, issues: [...issues, ...entryIssues] };
  });
  return { status: pageReports.some((page) => page.status === "unknown") ? "unknown" : pageReports.some((page) => page.status === "review") ? "review" : "recognised", pages: pageReports, athletes: assessments };
}
