/**
 * Lecture des résultats dans un PDF « tirage avec résultats » (étape 1, décision du 23/09/2026) :
 * le tableau de classement imprimé sous l'arbre (« Classification », « Prize winners: ») donne 1er, 2e, 3e, 3e
 * (parfois les 5es). Les battus en quart manquants ne sont déduits de l'arbre que lorsqu'ils sont certains
 * (adversaire de quart entré directement). Rien n'est enregistré : l'admin vérifie chaque division.
 */
import type { BracketDivision } from "./bracket-builder.ts";
import { buildTree, chainOf, setPlace, type BracketTree, type TreeFight, type TreeNode } from "./bracket-tree.ts";
import type { Places } from "./model.ts";
import type { Place } from "./prediction.ts";
import { sameAthlete } from "./source-audit.ts";
import type { ParsedPage, VisualTextItem } from "./types.ts";

export type RankingRow = { rank: number; name: string; country?: string };
export type Ranking = { pages: number[]; rows: RankingRow[] };

const HEADING = /^\s*(?:classification|prize\s+winners)\s*:?\s*$/i;
const RANK_START = /^\s*([1-8])(?:\s+|$)/;

/** « 1 DE MORAES Giovanni aubin (BRA) », « 1 ALDAOUD Ja'afar , JOR (265) », « 1 JUNG Woo-hyeok KOR ». */
export function parseRankingRow(text: string): RankingRow | null {
  const match = text.replace(/\s+/g, " ").trim().match(/^([1-8])\s+(.+)$/);
  if (!match) return null;
  let rest = match[2].replace(/\s*\(\d+\)\s*$/, "").trim();
  let country: string | undefined;
  const tail = rest.match(/^(.*?)\s*[,(]?\s*\(?([A-Z]{3}|WT)\)?\s*$/);
  if (tail && tail[1].trim()) { country = tail[2]; rest = tail[1]; }
  const name = rest.replace(/\s*,\s*$/, "").replace(/\s+/g, " ").trim();
  if (!/\p{L}{2,}/u.test(name)) return null;
  return { rank: Number(match[1]), name, ...(country ? { country } : {}) };
}

/** Tableaux de classement d'une page : lignes sous le titre, dans la colonne des rangs (les morceaux de l'arbre voisins sont écartés). */
export function pageRankings(page: ParsedPage): RankingRow[][] {
  const tables: RankingRow[][] = [];
  for (const heading of page.items.filter((item) => HEADING.test(item.text))) {
    const below = page.items.filter((item) => item !== heading && item.y > heading.y + 1 && item.y < heading.y + 110);
    const rankItems = below.filter((item) => RANK_START.test(item.text) && Math.abs(item.x - heading.x) < 90);
    if (!rankItems.length) continue;
    const rankX = Math.min(...rankItems.map((item) => item.x));
    const inColumn = below.filter((item) => item.x >= rankX - 4 && item.x < rankX + 165);
    const rows: VisualTextItem[][] = [];
    for (const item of [...inColumn].sort((a, b) => a.y - b.y || a.x - b.x)) {
      const row = rows.find((r) => Math.abs(r[0].y - item.y) <= 3);
      if (row) row.push(item); else rows.push([item]);
    }
    const parsed: RankingRow[] = [];
    for (const row of rows) {
      const ordered = row.sort((a, b) => a.x - b.x);
      if (Math.abs(ordered[0].x - rankX) > 6 || !RANK_START.test(ordered[0].text)) {
        if (parsed.length) break; // Fin du tableau : la colonne continue avec autre chose (légende, arbre).
        continue;
      }
      const entry = parseRankingRow(ordered.map((item) => item.text).join(" "));
      if (entry) parsed.push(entry);
    }
    if (parsed.length >= 2) tables.push(parsed);
  }
  return tables;
}

/** Tous les classements du PDF ; un même tableau réimprimé sur plusieurs pages (tableau coupé) n'est compté qu'une fois. */
export function readRankings(pages: ParsedPage[]): Ranking[] {
  const rankings: Ranking[] = [];
  for (const page of pages) {
    for (const rows of pageRankings(page)) {
      const key = JSON.stringify(rows);
      const same = rankings.find((r) => JSON.stringify(r.rows) === key);
      if (same) same.pages.push(page.pageNumber); else rankings.push({ pages: [page.pageNumber], rows });
    }
  }
  return rankings;
}

const PLACE_OF_RANK: Record<number, Place | undefined> = { 1: "gold", 2: "silver", 3: "bronze", 5: "quarter" };

export type DivisionResult = {
  /** Places lues puis complétées ; toujours cohérentes avec l'arbre. */
  places: Places;
  /** Battus en quart déduits de l'arbre (pas lus dans le PDF). */
  deduced: string[];
  pages: number[];
  /** Lignes du classement sans athlète correspondant dans la division. */
  unmatched: RankingRow[];
  issues: string[];
};

const findFight = (node: TreeNode, id: string): TreeFight | undefined => {
  if (node.kind !== "fight") return undefined;
  if (node.id === id) return node;
  for (const child of node.children) { const found = findFight(child, id); if (found) return found; }
  return undefined;
};
const contains = (node: TreeNode, athleteId: string): boolean =>
  node.kind === "athlete" ? node.entrant.athleteId === athleteId : node.children.some((child) => contains(child, athleteId));

/** Adversaire de quart certain : l'autre participant du quart gagné, s'il y est entré directement. */
function quarterOpponent(tree: BracketTree, athleteId: string): string | undefined {
  const chain = chainOf(tree, athleteId);
  const quarterId = chain[chain.length - 3]; // vainqueur du quart = demi-finaliste
  const quarter = quarterId ? findFight(tree.final, quarterId) : undefined;
  if (!quarter || quarter.level !== 2) return undefined;
  const other = quarter.children.find((child) => !contains(child, athleteId));
  return other?.kind === "athlete" ? other.entrant.athleteId : undefined;
}

/** Résultat d'une division à partir du classement qui lui correspond. */
export function divisionResult(division: BracketDivision, ranking: Ranking): DivisionResult {
  const tree = buildTree(division);
  let places: Places = { gold: [], silver: [], bronze: [], quarter: [] };
  const issues: string[] = [];
  const unmatched: RankingRow[] = [];
  const apply = (athleteId: string, place: Place, label: string) => {
    const next = setPlace(tree, places, athleteId, place);
    if (!next.places[place].includes(athleteId) || next.changes.length) {
      issues.push(`${label} : incohérent avec l'arbre, ignoré.`);
      return false;
    }
    places = next.places;
    return true;
  };
  for (const row of [...ranking.rows].sort((a, b) => a.rank - b.rank)) {
    const place = PLACE_OF_RANK[row.rank];
    const entrant = division.entrants.find((e) => sameAthlete(row, e));
    if (!entrant) { unmatched.push(row); continue; }
    if (!place) continue;
    apply(entrant.athleteId, place, `${row.rank} ${row.name}`);
  }
  const deduced: string[] = [];
  for (const athleteId of [...places.gold, ...places.silver, ...places.bronze]) {
    const opponent = quarterOpponent(tree, athleteId);
    if (!opponent || Object.values(places).some((ids) => ids.includes(opponent))) continue;
    if (apply(opponent, "quarter", `Battu en quart déduit`)) deduced.push(opponent);
  }
  if (unmatched.length) issues.push(`${unmatched.length} nom(s) du classement introuvable(s) dans la division : ${unmatched.map((r) => `${r.rank} ${r.name}`).join(", ")}.`);
  return { places, deduced, pages: ranking.pages, unmatched, issues };
}

/**
 * Associe chaque division au classement qui la concerne : celui dont les noms correspondent le mieux à ses athlètes
 * (au moins deux, et sans égalité). Une division sans classement sûr n'a pas de résultat : rien n'est deviné.
 */
export function matchRankings(divisions: Array<{ id: string; bracket: BracketDivision }>, rankings: Ranking[]) {
  return divisions.map(({ id, bracket }) => {
    const scored = rankings.map((ranking) => ({ ranking,
      hits: ranking.rows.filter((row) => bracket.entrants.some((e) => sameAthlete(row, e))).length }))
      .filter((s) => s.hits >= 2).sort((a, b) => b.hits - a.hits);
    const best = scored[0];
    if (!best || (scored[1] && scored[1].hits === best.hits)) return { id, result: null, ambiguous: !!best };
    return { id, result: divisionResult(bracket, best.ranking), ambiguous: false };
  });
}
