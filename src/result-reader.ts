/**
 * Lecture des résultats dans un PDF « tirage avec résultats » (étape 1, décision du 23/09/2026) :
 * le tableau de classement imprimé sous l'arbre (« Classification », « Prize winners: ») donne 1er, 2e, 3e, 3e
 * (parfois les 5es). Étape 2 : le vainqueur de chaque combat, réimprimé en abrégé à la sortie du combat
 * (« OKAZAKI S. (JPN) »), complète les places manquantes (battus en quart surtout), et donne les résultats
 * des PDF sans tableau de classement. Les battus en quart restants ne sont déduits de l'arbre que lorsqu'ils
 * sont certains. Rien n'est enregistré : l'admin vérifie chaque division.
 */
import type { BracketDivision } from "./bracket-builder.ts";
import { buildTree, chainOf, placesFromState, setPlace, PLAYABLE_LEVEL, type BracketTree, type TreeFight, type TreeNode, type TreeState } from "./bracket-tree.ts";
import type { Places } from "./model.ts";
import { expectedPicks, type Place } from "./prediction.ts";
import { sameAthlete as sameAthleteStrict } from "./source-audit.ts";
import { extractMarkers } from "./team-path-parser.ts";
import type { ParsedPage, VisualTextItem } from "./types.ts";

/**
 * La police des feuilles WT (Woori) rend souvent « l » par « I » dans les prénoms en minuscules : « cIara », « EIIa ».
 * Le tirage publié peut avoir été lu autrement (« clara », « Ella ») : les noms sont comparés tels quels, puis avec ce « I »
 * remplacé par « l » dans les mots en casse mixte (les noms de famille en capitales ne changent pas). La table de glyphes
 * n'est pas modifiée.
 */
export const fixWtLetterL = (name: string) => name.split(/(\s+)/)
  .map((word) => (/[a-z]/.test(word) ? word.replace(/(?!^)I/g, "l") : word)).join("");
const sameAthlete = (a: { name: string; country?: string }, b: { name: string; country?: string }) =>
  sameAthleteStrict(a, b) || sameAthleteStrict({ ...a, name: fixWtLetterL(a.name) }, { ...b, name: fixWtLetterL(b.name) });

export type RankingRow = { rank: number; name: string; country?: string };
export type Ranking = { pages: number[]; rows: RankingRow[] };

// La police des feuilles WT (Woori) rend souvent « l » par « I » : « CIassification ». Le titre tolère cette confusion.
const HEADING = /^\s*(?:c[lI1|]assification|prize\s+winners)\s*:?\s*$/i;
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
    // Une ligne sans rang juste sous une ligne classée est la suite d'un nom long (« 2 RODRIGUES FERNANDES Henrique » / « marques (BRA) »).
    const texts: string[] = [];
    let previousY = -Infinity;
    for (const row of rows) {
      const ordered = row.sort((a, b) => a.x - b.x);
      const text = ordered.map((item) => item.text).join(" ");
      const ranked = Math.abs(ordered[0].x - rankX) <= 6 && RANK_START.test(ordered[0].text);
      if (ranked) texts.push(text);
      else if (texts.length && ordered[0].y - previousY <= 10 && ordered[0].x >= rankX - 4) texts[texts.length - 1] += ` ${text}`;
      else if (texts.length) break; // Fin du tableau : la colonne continue avec autre chose (légende, arbre).
      else continue;
      previousY = ordered[0].y;
    }
    const parsed = texts.map(parseRankingRow).filter((row): row is RankingRow => !!row);
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

/** Vainqueur réimprimé dans l'arbre : nom abrégé par des initiales, pays entre parenthèses (« TSANG C. H. (HKG) », « ABAD I.(ESP) »). */
const WINNER_MARK = /^(.+?\s(?:-?[A-Z][a-z]?[.-]\s?)+)\s*\(([A-Z]{3}|WT)\)\s*$/;

/** `fight` : numéro du combat imprimé juste à côté du nom (le vainqueur s'écrit collé à la case du combat). */
export type WinnerMark = { page: number; name: string; country: string; fight?: string };

/**
 * Nom réimprimé coupé sur deux lignes par la feuille (« UZUNCAVDAR » / « S.I. (TUR) », « DEHHAOUI A. » / « (MAR) ») :
 * la seconde ligne, alignée juste sous la première, porte le pays ; les deux sont réunies.
 */
function joinWrappedMarks(items: VisualTextItem[]): Array<{ text: string; lines: VisualTextItem[] }> {
  const used = new Set<VisualTextItem>();
  const joined: Array<{ text: string; lines: VisualTextItem[] }> = [];
  for (const item of items) {
    if (used.has(item)) continue;
    const text = item.text.replace(/\s+/g, " ").trim();
    if (!WINNER_MARK.test(text) && /^[A-Z][A-Z' -]+(?:\s(?:-?[A-Z][a-z]?[.-]\s?)+)?$/.test(text)) {
      const next = items.find((other) => other !== item && !used.has(other)
        && other.y - item.y >= 3 && other.y - item.y <= 10 && Math.abs(other.x - item.x) <= 4
        && /\((?:[A-Z]{3}|WT)\)\s*$/.test(other.text.trim()) && other.text.trim().length <= 20);
      if (next && WINNER_MARK.test(`${text} ${next.text.trim()}`)) {
        used.add(item); used.add(next);
        joined.push({ text: `${text} ${next.text.trim()}`, lines: [item, next] });
        continue;
      }
    }
    joined.push({ text, lines: [item] });
  }
  return joined;
}

export function readWinnerMarks(pages: ParsedPage[]): WinnerMark[] {
  return pages.flatMap((page) => {
    const markers = extractMarkers(page);
    return joinWrappedMarks(page.items).flatMap(({ text, lines }) => {
      const match = text.match(WINNER_MARK);
      if (!match || RANK_START.test(text)) return [];
      // Case du combat sur la même ligne (l'une des lignes du nom), collée au début (moitié gauche) ou à la fin (moitié droite).
      const near = markers.flatMap((m) => lines.map((item) => ({ m,
        gap: Math.min(Math.abs(m.x - item.x), Math.abs(m.x - (item.x + item.width))), dy: Math.abs(m.y - (item.y + item.height / 2)) })))
        .filter((c) => c.dy <= 8 && c.gap <= 45).sort((a, b) => a.gap + a.dy - (b.gap + b.dy))
        .filter((c, i, all) => all.findIndex((o) => o.m === c.m) === i);
      const fight = near.length && (near.length === 1 || near[1].gap + near[1].dy - (near[0].gap + near[0].dy) > 6) ? near[0].m.code : undefined;
      return [{ page: page.pageNumber, name: match[1].trim(), country: match[2], ...(fight ? { fight } : {}) }];
    });
  });
}

const fightsOf = (node: TreeNode): TreeFight[] => (node.kind === "fight" ? [node, ...node.children.flatMap(fightsOf)] : []);
const athletesOf = (node: TreeNode): string[] => (node.kind === "athlete" ? [node.entrant.athleteId] : node.children.flatMap(athletesOf));

/**
 * Vainqueur de chaque combat jouable d'après les noms réimprimés, par deux méthodes indépendantes :
 * le nom collé à la case du combat, et le décompte (l'athlète de la branche qui a au moins autant de victoires que de combats
 * sur son parcours jusqu'à celui-ci ; faussé par les exemptions réimprimées, d'où la priorité à la case).
 * Seulement sur les pages où ces noms sont surtout ceux de la division ; si les deux méthodes se contredisent, rien.
 */
export function winnersFromMarks(division: BracketDivision, tree: BracketTree, marks: WinnerMark[]): { state: TreeState; pages: number[] } {
  const owner = (mark: WinnerMark) => {
    const found = division.entrants.filter((e) => sameAthlete(mark, e));
    return found.length === 1 ? found[0].athleteId : undefined;
  };
  const pages = [...new Set(marks.map((m) => m.page))].filter((page) => {
    const onPage = marks.filter((m) => m.page === page);
    const mine = onPage.filter((m) => owner(m)).length;
    return mine >= 3 && mine * 2 >= onPage.length;
  });
  const wins = new Map<string, number>();
  for (const mark of marks.filter((m) => pages.includes(m.page))) {
    const id = owner(mark);
    if (id) wins.set(id, (wins.get(id) ?? 0) + 1);
  }
  const state: TreeState = {};
  if (!pages.length) return { state, pages };
  const entrant = new Map(division.entrants.map((e) => [e.athleteId, e]));
  const onPages = marks.filter((m) => pages.includes(m.page));
  for (const fight of fightsOf(tree.final).filter((f) => f.level <= PLAYABLE_LEVEL)) {
    const inBranch = athletesOf(fight);
    const byBox = [...new Set(onPages.filter((m) => m.fight === fight.code).map(owner).filter((id): id is string => !!id && inBranch.includes(id)))];
    const byCount = inBranch.filter((id) => {
      const path = entrant.get(id)?.path ?? [];
      const index = path.indexOf(fight.code);
      const needed = index >= 0 ? index + 1 : fight === tree.final ? path.length + 1 : Infinity;
      return (wins.get(id) ?? 0) >= needed;
    });
    const boxed = byBox.length === 1 ? byBox[0] : undefined;
    const counted = byCount.length === 1 ? byCount[0] : undefined;
    if (boxed && counted && boxed !== counted) continue;
    const winner = boxed ?? counted;
    if (winner) state[fight.id] = winner;
  }
  // Cohérence : le vainqueur d'un combat doit avoir gagné le combat précédent de sa branche s'il est connu.
  for (const fight of fightsOf(tree.final)) {
    const winner = state[fight.id];
    if (!winner) continue;
    const child = fight.children.find((c) => c.kind === "fight" && athletesOf(c).includes(winner));
    if (child && state[child.id] && state[child.id] !== winner) delete state[fight.id];
  }
  return { state, pages };
}

const PLACE_OF_RANK: Record<number, Place | undefined> = { 1: "gold", 2: "silver", 3: "bronze", 5: "quarter" };

/**
 * Pourquoi un résultat n'est pas vérifié automatiquement (codes traduits par l'interface) :
 * no-ranking : pas de tableau de classement, donc pas de seconde lecture ;
 * unmatched-names : un nom du classement ne correspond à aucun athlète de la division ;
 * podium-incomplete : le classement ne donne pas 1er, 2e et tous les 3es ;
 * podium-not-confirmed : les vainqueurs des combats ne confirment pas les finalistes et les 3es du classement ;
 * quarters-missing : des battus en quart restent inconnus ;
 * inconsistent : une place lue contredit l'arbre.
 */
export type ResultReason = "no-ranking" | "unmatched-names" | "podium-incomplete" | "podium-not-confirmed" | "quarters-missing" | "inconsistent";

export type DivisionResult = {
  /** Places lues puis complétées ; toujours cohérentes avec l'arbre. */
  places: Places;
  /** Battus en quart déduits de l'arbre (pas lus dans le PDF). */
  deduced: string[];
  /** Places trouvées grâce aux vainqueurs des combats réimprimés (étape 2). */
  fromWinners: string[];
  pages: number[];
  /** Lignes du classement sans athlète correspondant dans la division. */
  unmatched: RankingRow[];
  issues: string[];
  /**
   * Vérification automatique : le classement officiel et les vainqueurs des combats (deux lectures indépendantes de la
   * feuille) donnent les mêmes finalistes et les mêmes 3es, tous les battus en quart sont connus, rien n'est incohérent.
   * Un résultat vérifié peut être enregistré sans contrôle manuel ; sinon `reasons` dit quoi regarder.
   */
  verified: boolean;
  reasons: ResultReason[];
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

/** Résultat d'une division : son classement (s'il y en a un), complété par les vainqueurs des combats réimprimés. */
export function divisionResult(division: BracketDivision, ranking: Ranking | null, marks: WinnerMark[] = []): DivisionResult {
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
  for (const row of [...(ranking?.rows ?? [])].sort((a, b) => a.rank - b.rank)) {
    const place = PLACE_OF_RANK[row.rank];
    const entrant = division.entrants.find((e) => sameAthlete(row, e));
    if (!entrant) { unmatched.push(row); continue; }
    if (!place) continue;
    apply(entrant.athleteId, place, `${row.rank} ${row.name}`);
  }
  const fromRanking: Places = { gold: [...places.gold], silver: [...places.silver], bronze: [...places.bronze], quarter: [...places.quarter] };
  // Étape 2 : places issues des vainqueurs des combats, pour ce que le classement ne donne pas.
  const winners = winnersFromMarks(division, tree, marks);
  const fromWinners: string[] = [];
  const read = placesFromState(tree, winners.state);
  const nameOf = (id: string) => division.entrants.find((e) => e.athleteId === id)?.name ?? id;
  for (const place of ["gold", "silver", "bronze", "quarter"] as Place[]) {
    for (const athleteId of read[place]) {
      const current = Object.entries(places).find(([, ids]) => ids.includes(athleteId))?.[0];
      if (current === place) continue;
      if (current) { issues.push(`${nameOf(athleteId)} : ${current} au classement, ${place} d'après les combats ; le classement est gardé.`); continue; }
      if (apply(athleteId, place, `${nameOf(athleteId)} (vainqueurs des combats)`)) fromWinners.push(athleteId);
    }
  }
  const deduced: string[] = [];
  for (const athleteId of [...places.gold, ...places.silver, ...places.bronze]) {
    const opponent = quarterOpponent(tree, athleteId);
    if (!opponent || Object.values(places).some((ids) => ids.includes(opponent))) continue;
    if (apply(opponent, "quarter", `Battu en quart déduit`)) deduced.push(opponent);
  }
  if (unmatched.length) issues.push(`${unmatched.length} nom(s) du classement introuvable(s) dans la division : ${unmatched.map((r) => `${r.rank} ${r.name}`).join(", ")}.`);
  const pages = [...new Set([...(ranking?.pages ?? []), ...winners.pages])].sort((a, b) => a - b);

  // Vérification croisée : finalistes (vainqueurs des demies) et 3es lus dans les combats = ceux du classement.
  const expected = expectedPicks(division);
  const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
  const semis = tree.final.children.filter((child): child is TreeFight => child.kind === "fight");
  const finalists = semis.map((semi) => winners.state[semi.id]).filter((id): id is string => !!id);
  const confirmed = semis.length === 2
    ? finalists.length === 2 && same(finalists, [...fromRanking.gold, ...fromRanking.silver]) && same(read.bronze, fromRanking.bronze)
    : same(read.gold, fromRanking.gold) && same(read.silver, fromRanking.silver);
  const reasons: ResultReason[] = [];
  if (!ranking) reasons.push("no-ranking");
  if (unmatched.length) reasons.push("unmatched-names");
  if (ranking && (fromRanking.gold.length !== expected.gold || fromRanking.silver.length !== expected.silver || fromRanking.bronze.length !== expected.bronze)) reasons.push("podium-incomplete");
  if (ranking && !confirmed) reasons.push("podium-not-confirmed");
  if (places.quarter.length < expected.quarter) reasons.push("quarters-missing");
  if (issues.length) reasons.push("inconsistent");
  return { places, deduced, fromWinners, pages, unmatched, issues, verified: reasons.length === 0, reasons };
}

/**
 * Associe chaque division au classement qui la concerne : celui dont les noms correspondent le mieux à ses athlètes
 * (au moins deux, et sans égalité). Une division sans classement sûr n'a pas de résultat : rien n'est deviné.
 */
export function matchRankings(divisions: Array<{ id: string; bracket: BracketDivision }>, rankings: Ranking[], marks: WinnerMark[] = []) {
  return divisions.map(({ id, bracket }) => {
    const scored = rankings.map((ranking) => ({ ranking,
      hits: ranking.rows.filter((row) => bracket.entrants.some((e) => sameAthlete(row, e))).length }))
      .filter((s) => s.hits >= 2).sort((a, b) => b.hits - a.hits);
    const best = scored[0];
    const ambiguous = !!best && !!scored[1] && scored[1].hits === best.hits;
    const result = divisionResult(bracket, ambiguous || !best ? null : best.ranking, marks);
    const found = Object.values(result.places).some((ids) => ids.length);
    return { id, result: found ? result : null, ambiguous };
  });
}
