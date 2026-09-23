/**
 * Vérification de l'arbre reconstruit contre le PDF source, comme le fait l'admin à l'œil :
 * chaque nom imprimé dans les colonnes de la feuille doit se retrouver dans l'arbre, et inversement.
 *
 * La relecture des noms est volontairement plus large que celle du moteur (codes pays de 2 ou 3 lettres,
 * pays avant ou après le nom, dossard TaekoPlan) : elle rattrape ce que le moteur a sauté, par exemple
 * « (4) BASSETT Jaycee WT » (équipe des réfugiés, code « WT ») au Grand Prix de Muju 2026.
 * Un nom manquant est ajouté à sa place, calculée par le moteur à partir de la géométrie de la page,
 * et signalé : la division reste à valider par l'admin, rien n'est publié sans lui.
 */
import type { BracketDivision, BracketEntrant } from "./bracket-builder.ts";
import { replaceEntrants } from "./bracket-editing.ts";
import { countryFirstPage, normalizeDrawText, pathForSourceItem } from "./team-path-parser.ts";
import type { ParsedPage, VisualTextItem } from "./types.ts";

export type SourceName = {
  name: string;
  country?: string;
  seed?: number;
  page: number;
  side: "left" | "right";
  item: VisualTextItem;
  /** Vainqueur réimprimé en abrégé dans l'arbre (« LIU Y.Y. (TPE) ») : le même athlète qu'un entrant. */
  reprint: boolean;
  shape: "bib" | "country-first" | "country-last" | "seed-only";
};

// « Semi », « Round » ou « Quarter » peuvent être des prénoms : seuls les libellés sans ambiguïté sont exclus.
const NOT_A_NAME = /\b(?:FREE DRAW|BYE|WINNER|WINNERS|FINAL|CONTESTANTS?|CLASSIFICATION|LEGEND|PRIZE|WITHDRAWAL|DISQUALIF\w*|REFEREE|SEED|RESULTS?|TOURNAMENT|COMPETITION|CHAMPIONSHIPS?|PAGE|CONTEST|SCORE)\b|\b(?:PTF|PTG|RSC|WDR|DSQ|DQB|GDP|SUP|PUN)\b/i;
const AFFILIATION = /\b(?:TEAM|CLUB|ACADEMY|FEDERATION|NATIONAL|ASSOCIATION|UNIVERSITY|SPORTS?|DOJO|SCHOOL|REGION|MINISTRY|ARMY|POLICE)\b/i;
const SEED = /^\((\d{1,3}|x)\)\s*/i;
const BIB = /^[BR]\s*\/\s*\d+\s*/i;
const COUNTRY_LAST = /^(.+?)\s+\(?([A-Z]{2,3})\)?$/;
const COUNTRY_FIRST = /^([A-Z]{3})\s+(.+)$/;

const tidy = (value: string) => value.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const isName = (value: string) => /\p{L}{2,}/u.test(value) && !/\d/.test(value) && !NOT_A_NAME.test(value) && !AFFILIATION.test(value);
// Numéros de combat (« 107 », « 928.1 ») et scores (« PTF 2-0 ») : jamais une partie de nom.
const NOT_TEXT = /^(?:[\d.\s/()-]+|(?:PTF|PTG|RSC|WDR|DSQ|DQB|GDP|SUP|PUN)\b.*)$/i;
// Mention de résultat collée au nom : « GARBA Sara (DSQ) ».
const RESULT_SUFFIX = /\s*\((?:DSQ|WDR|DQB|RSC|PTF|PTG|GDP|SUP|PUN)\)\s*$/i;
// Vainqueur réimprimé dans l'arbre : « LIU Y.Y. (TPE) », « R. Williams.(GBR) ».
const REPRINT = /\.\s?\(\s?[A-Z]{2,3}\s?\)$/;

type Line = VisualTextItem & { side: "left" | "right" };

/** Lignes des colonnes extérieures (où sont imprimés les athlètes) : une ligne = éléments voisins d'une même rangée. */
function outerLines(page: ParsedPage): Line[] {
  const outer = page.items.filter((item) => (item.x < page.width * 0.25 || item.x + item.width > page.width * 0.75)
    && item.y > page.height * 0.04 && item.y < page.height * 0.94 && tidy(item.text) && !NOT_TEXT.test(tidy(item.text)));
  const rows: Array<{ y: number; side: "left" | "right"; items: VisualTextItem[] }> = [];
  for (const item of [...outer].sort((a, b) => a.y - b.y)) {
    const side = item.x + item.width / 2 < page.width / 2 ? "left" : "right";
    const row = rows.find((r) => r.side === side && Math.abs(r.y - item.y) < 2);
    if (row) row.items.push(item);
    else rows.push({ y: item.y, side, items: [item] });
  }
  const lines: Line[] = [];
  for (const row of rows) {
    let segment: VisualTextItem[] = [];
    const flush = () => {
      if (!segment.length) return;
      const x = segment[0].x;
      const right = Math.max(...segment.map((i) => i.x + i.width));
      lines.push({ text: segment.map((i) => tidy(i.text)).join(" "), x, y: row.y, width: right - x,
        height: Math.max(...segment.map((i) => i.height)), side: row.side });
      segment = [];
    };
    for (const item of [...row.items].sort((a, b) => a.x - b.x)) {
      const previous = segment.at(-1);
      // Un dossard court (« B/6 ») laisse plus d'espace avant le nom : il reste rattaché au nom qui suit.
      const gap = previous && /^[BR]\s*\/\s*\d*$/i.test(tidy(previous.text)) ? page.width * 0.08 : page.width * 0.03;
      if (previous && item.x - (previous.x + previous.width) > gap) flush();
      segment.push(item);
    }
    flush();
  }
  return lines;
}

/** Forme d'une ligne d'athlète : sert à ne rien ajouter qui ne ressemble pas aux athlètes déjà reconnus. */
type Shape = "bib" | "country-first" | "country-last" | "seed-only";

/** Noms d'athlètes lisibles sur une page, relus indépendamment du moteur. */
export function sourceNames(page: ParsedPage): SourceName[] {
  const lines = outerLines(page);
  // Pages TaekoPlan : le nom est sur la ligne du dossard, le pays sur la ligne du club en dessous.
  // Un seul dossard suffit : les feuilles WT n'en impriment jamais (une finale directe n'a que deux lignes).
  const bibPage = lines.some((line) => BIB.test(line.text));
  const countryFirst = !bibPage && countryFirstPage(lines.filter((line) => !REPRINT.test(line.text)));
  const hasCountry = (text: string) => {
    const rest = text.replace(SEED, "").replace(RESULT_SUFFIX, "");
    return COUNTRY_LAST.test(rest) || COUNTRY_FIRST.test(rest);
  };
  // Nom long imprimé sur deux lignes, la seconde alignée sous la première : « (1) RODRIGUES FERNANDES » + « Henrique marques BRA ».
  const merged: Line[] = [];
  for (const line of [...lines].sort((a, b) => a.side.localeCompare(b.side) || a.y - b.y)) {
    const previous = merged.at(-1);
    const edge = (l: Line) => (l.side === "left" ? l.x : l.x + l.width);
    if (!bibPage && previous && previous.side === line.side && !SEED.test(line.text) && !REPRINT.test(previous.text)
      && !hasCountry(previous.text) && line.y > previous.y && line.y - previous.y <= Math.max(10, previous.height * 1.8)
      && Math.abs(edge(line) - edge(previous)) <= Math.max(6, page.width * 0.01)) {
      const x = Math.min(previous.x, line.x);
      merged[merged.length - 1] = { ...previous, text: `${previous.text} ${line.text}`, x,
        width: Math.max(previous.x + previous.width, line.x + line.width) - x };
    } else merged.push(line);
  }
  const names: SourceName[] = [];
  for (const line of merged) {
    const text = tidy(line.text).replace(RESULT_SUFFIX, "");
    const reprint = REPRINT.test(text);
    const bib = BIB.test(text);
    if (bibPage && !bib) continue;
    let rest = text.replace(BIB, "");
    const seedMatch = rest.match(SEED);
    const seed = seedMatch && /\d/.test(seedMatch[1]) ? Number(seedMatch[1]) : undefined;
    rest = rest.replace(SEED, "").trim();
    let name: string | undefined;
    let country: string | undefined;
    let shape: Shape;
    if (bib) [name, shape] = [rest, "bib"];
    else {
      const last = rest.match(COUNTRY_LAST);
      const first = rest.match(COUNTRY_FIRST);
      if (reprint && last) [name, country, shape] = [last[1].replace(/\.$/, ""), last[2], "country-last"];
      else if (first && (countryFirst || !last)) [name, country, shape] = [first[2], first[1], "country-first"];
      else if (last) [name, country, shape] = [last[1], last[2], "country-last"];
      else if (seedMatch) [name, shape] = [rest, "seed-only"];
      else continue;
    }
    name = tidy(name.replace(/,/g, " "));
    if (name.length < 3 || !isName(name)) continue;
    names.push({ name, ...(country ? { country } : {}), ...(seed ? { seed } : {}), page: page.pageNumber, side: line.side,
      item: line, reprint, shape });
  }
  return names;
}

const tokens = (name: string) => normalizeDrawText(name).split(" ").filter(Boolean);
const compatible = (a: string, b: string) => a.startsWith(b) || b.startsWith(a);

/**
 * Même athlète ? Nom identique ; sinon même nom de famille (premier mot) et prénoms compatibles, dans l'ordre :
 * mot entier, début de mot (nom coupé) ou initiale (« PSARROS A.N. » = « PSARROS Anastasios Nikolaos »),
 * un prénom pouvant manquer au milieu (« MIYANYEDI ozkan » = « MIYANYEDI Semi ozkan »).
 * Un pays différent n'exclut qu'une correspondance approchée.
 */
export function sameAthlete(a: { name: string; country?: string }, b: { name: string; country?: string }): boolean {
  const [x, y] = [tokens(a.name), tokens(b.name)];
  if (!x.length || !y.length) return false;
  if (x.join(" ") === y.join(" ")) return true;
  if (a.country && b.country && a.country !== b.country) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  // Nom réduit à un mot, coupé au bord de la feuille (« KINTSURASHVIL ») : même début et même pays exigés.
  if (short.length === 1) return short[0].length >= 5 && long[0].startsWith(short[0]) && !!a.country && a.country === b.country;
  if (short[0] !== long[0]) return false;
  let j = 1;
  for (const token of short.slice(1)) {
    while (j < long.length && !compatible(long[j], token)) j += 1;
    if (j >= long.length) return false;
    j += 1;
  }
  return true;
}

export type DivisionAudit = {
  /** « Contestants » imprimé sur la feuille, s'il y en a un seul pour la division. */
  declared?: number;
  /** Athlètes distincts lus sur la feuille. */
  sourceCount: number;
  /** Part des athlètes de l'arbre retrouvés sur la feuille : en dessous de 80 %, la relecture de ce format n'est pas fiable. */
  matchedRatio: number;
  /** Noms de la feuille absents de l'arbre, alignés sur la colonne des athlètes reconnus : ajoutés automatiquement. */
  missing: SourceName[];
  /** Noms de la feuille absents de l'arbre mais hors de la colonne des athlètes : signalés, jamais ajoutés. */
  uncertain: SourceName[];
  /** Athlètes de l'arbre dont le nom n'apparaît pas sur la feuille (lecture douteuse) ; vide si la relecture n'est pas fiable. */
  notInSource: string[];
};

const RELIABLE = 0.8;

/** Le nom est-il imprimé dans la même colonne, sous la même forme, que les athlètes déjà reconnus sur ce côté de la page ? */
function inAthleteColumn(candidate: SourceName, recognised: SourceName[], pages: ParsedPage[]): boolean {
  const page = pages.find((p) => p.pageNumber === candidate.page)!;
  const peers = recognised.filter((n) => n.page === candidate.page && n.side === candidate.side && n.shape === candidate.shape);
  if (peers.length < 2) return false;
  const edge = (n: SourceName) => (n.side === "left" ? n.item.x : n.item.x + n.item.width);
  const edges = peers.map(edge).sort((a, b) => a - b);
  const median = edges[Math.floor(edges.length / 2)];
  return Math.abs(edge(candidate) - median) <= Math.max(6, page.width * 0.01);
}

/**
 * `siblings` : les autres divisions lues dans le même PDF. Une page peut porter plusieurs tableaux :
 * les noms qui appartiennent à une autre division ne sont jamais signalés ni ajoutés ici.
 */
export function auditDivision(division: BracketDivision, pages: ParsedPage[], siblings: BracketDivision[] = []): DivisionAudit {
  const own = pages.filter((page) => division.pages.includes(page.pageNumber));
  const neighbours = siblings.filter((d) => d !== division && d.key !== division.key && d.pages.some((p) => division.pages.includes(p)))
    .flatMap((d) => d.entrants);
  const names = own.flatMap(sourceNames).filter((n) => !neighbours.some((e) => sameAthlete(e, n)) || division.entrants.some((e) => sameAthlete(e, n)));
  // Une même personne peut être imprimée deux fois (page de la finale d'un tableau coupé) : une seule entrée.
  const distinct: SourceName[] = [];
  for (const name of names.filter((n) => !n.reprint)) if (!distinct.some((d) => sameAthlete(d, name))) distinct.push(name);
  const reprints = names.filter((n) => n.reprint);
  const found = (e: BracketEntrant) => distinct.some((n) => sameAthlete(e, n)) || reprints.some((r) => sameAthlete(e, r));
  const matchedRatio = division.entrants.length ? division.entrants.filter(found).length / division.entrants.length : 0;
  const recognised = names.filter((n) => !n.reprint && division.entrants.some((e) => sameAthlete(e, n)));
  const absent = matchedRatio >= RELIABLE ? distinct.filter((name) => !division.entrants.some((e) => sameAthlete(e, name))) : [];
  const declaredValues = [...new Set(own.map((page) => Number(page.rawText.match(/\bContestants\s*:?\s*(\d+)/i)?.[1])).filter((n) => n > 0))];
  return {
    ...(declaredValues.length === 1 ? { declared: declaredValues[0] } : {}),
    sourceCount: distinct.length,
    matchedRatio,
    missing: absent.filter((name) => inAthleteColumn(name, recognised, own)),
    uncertain: absent.filter((name) => !inAthleteColumn(name, recognised, own)),
    notInSource: matchedRatio >= RELIABLE ? division.entrants.filter((e) => !found(e)).map((e) => e.athleteId) : [],
  };
}

const fromEnd = (path: string[], steps: number) => path[path.length - 1 - steps];

/** Raccorde le parcours calculé sur la page à celui de la division (tableau coupé en plusieurs pages, par exemple). */
function alignPath(path: string[], division: BracketDivision): string[] {
  for (let i = 0; i < path.length; i += 1) {
    const carrier = division.entrants.find((e) => e.path.includes(path[i]));
    if (carrier) return [...path.slice(0, i), ...carrier.path.slice(carrier.path.indexOf(path[i]))];
  }
  return path;
}

/** Place d'insertion : juste après l'athlète qui partage le plus long bout de parcours (même premier combat, même quart…). */
function insertionIndex(division: BracketDivision, path: string[]): number {
  let best = -1;
  let bestShared = 0;
  division.entrants.forEach((entrant, index) => {
    const shared = path.findIndex((fight) => entrant.path.includes(fight));
    const score = shared < 0 ? 0 : path.length - shared;
    if (score > bestShared || (score === bestShared && score > 0)) [best, bestShared] = [index, score];
  });
  return best + 1 || division.entrants.length;
}

export type PathFinder = (page: ParsedPage, item: VisualTextItem, roster: VisualTextItem[]) => string[];

/**
 * Applique la vérification : ajoute à leur place les athlètes de la feuille absents de l'arbre,
 * et signale les écarts. Les contrôles de structure sont rejoués par l'appelant (bracket-editing).
 */
export function withSourceAthletes(
  division: BracketDivision,
  pages: ParsedPage[],
  options: { siblings?: BracketDivision[]; findPath?: PathFinder } = {},
): { division: BracketDivision; audit: DivisionAudit; added: BracketEntrant[] } {
  const findPath = options.findPath ?? pathForSourceItem;
  const audit = auditDivision(division, pages, options.siblings);
  let entrants = [...division.entrants];
  const added: BracketEntrant[] = [];
  for (const missing of audit.missing) {
    const page = pages.find((p) => p.pageNumber === missing.page)!;
    const roster = sourceNames(page).map((n) => n.item);
    const path = alignPath(findPath(page, missing.item, roster), { ...division, entrants });
    const entrant: BracketEntrant = {
      athleteId: `pdf-${missing.page}-${Math.round(missing.item.y)}-${missing.side}`,
      name: missing.name,
      ...(missing.country ? { country: missing.country } : {}),
      ...(missing.seed ? { seed: missing.seed } : {}),
      position: 0,
      side: missing.side,
      page: missing.page,
      path,
      ...(fromEnd(path, 1) ? { half: fromEnd(path, 1) } : {}),
      ...(fromEnd(path, 2) ? { quarter: fromEnd(path, 2) } : {}),
    };
    const at = insertionIndex({ ...division, entrants }, path);
    entrants = [...entrants.slice(0, at), entrant, ...entrants.slice(at)];
    added.push(entrant);
  }
  const issues = [...division.issues];
  const label = (e: { name: string; country?: string }) => `${e.name}${e.country ? ` (${e.country})` : ""}`;
  if (added.length) issues.push(`Vérification du PDF : ${added.length} athlète(s) absent(s) de la lecture, ajouté(s) à sa place : ${added.map(label).join(", ")}. Vérifie contre le PDF.`);
  if (audit.uncertain.length) issues.push(`Vérification du PDF : ${audit.uncertain.length} nom(s) de la feuille peut-être absent(s) de l'arbre, non ajouté(s) : ${audit.uncertain.map(label).join(", ")}.`);
  if (audit.matchedRatio < RELIABLE) issues.push("Vérification du PDF limitée : cette mise en page est mal relue, compare l'arbre au PDF à l'œil.");
  if (audit.notInSource.length) {
    const unknown = division.entrants.filter((e) => audit.notInSource.includes(e.athleteId));
    issues.push(`Vérification du PDF : ${unknown.length} athlète(s) de l'arbre introuvable(s) sur la feuille : ${unknown.map(label).join(", ")}.`);
  }
  if (issues.length === division.issues.length) return { division, audit, added };
  const annotated: BracketDivision = { ...division, issues, status: "review" };
  return { division: added.length ? replaceEntrants(annotated, entrants) : annotated, audit, added };
}
