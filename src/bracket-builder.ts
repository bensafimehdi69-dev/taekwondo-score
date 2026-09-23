/**
 * Reconstruction des arbres de Taekwondo Score à partir de l'index complet du moteur.
 *
 * Principe : le moteur donne, pour chaque athlète, son parcours potentiel jusqu'à la finale.
 * En lisant ce parcours depuis la fin (finale, demi, quart), on obtient pour chaque athlète
 * sa moitié et son quart d'arbre, sans relire la géométrie du PDF.
 *
 * Aucune valeur n'est forcée : toute incohérence met la division en « review ».
 */
import { normalizeDrawText, type TeamAthlete, type TeamDrawAnalysis } from "./team-path-parser.ts";

export type BracketEntrant = {
  athleteId: string;
  name: string;
  country?: string;
  seed?: number;
  /** Ordre de lecture de l'arbre : côté gauche de haut en bas, puis côté droit de haut en bas (1 = premier). */
  position: number;
  side: "left" | "right";
  page: number;
  path: string[];
  /** Combat de demi-finale du parcours : identifie la moitié d'arbre. */
  half?: string;
  /** Combat de quart de finale du parcours ; absent si l'athlète entre directement en demi (exempt). */
  quarter?: string;
};

export type BracketDivision = {
  key: string;
  category: string;
  ageCategory: string;
  genderCategory: string;
  weightCategory: string;
  pages: number[];
  finalFight?: string;
  size: number;
  entrants: BracketEntrant[];
  /** Combats de demi-finale réellement disputables (2 au plus). */
  semiFights: string[];
  /** Combats de quart de finale réellement disputables (4 au plus). */
  quarterFights: string[];
  status: "ok" | "review";
  issues: string[];
};

const MAX_SEMIS = 2;
const MAX_QUARTERS = 4;

function divisionKey(athlete: TeamAthlete): string {
  const final = athlete.path.at(-1);
  return final ? `${athlete.category}#${final}` : `${athlete.category}#page${athlete.page}`;
}

function fromEnd(path: string[], stepsBeforeFinal: number): string | undefined {
  const index = path.length - 1 - stepsBeforeFinal;
  return index >= 0 ? path[index] : undefined;
}

/** Demi-finales et quarts réellement disputables, déduits des parcours des athlètes. */
export function bracketFights(entrants: BracketEntrant[]): { semiFights: string[]; quarterFights: string[] } {
  return {
    semiFights: [...new Set(entrants.map((e) => e.half).filter((v): v is string => !!v))],
    quarterFights: [...new Set(entrants.map((e) => e.quarter).filter((v): v is string => !!v))],
  };
}

/** Contrôles de structure d'une division, rejoués après chaque correction manuelle de l'arbre. */
export function checkBracket(entrants: BracketEntrant[], finalFight?: string): string[] {
  const issues: string[] = [];
  if (!finalFight) issues.push("Aucun parcours relié : l'arbre ne peut pas être reconstruit.");
  const { semiFights, quarterFights } = bracketFights(entrants);

  if (entrants.length < 2) issues.push("Moins de deux athlètes dans la division.");
  if (semiFights.length > MAX_SEMIS) issues.push(`${semiFights.length} demi-finales détectées au lieu de 2 au plus.`);
  if (quarterFights.length > MAX_QUARTERS) issues.push(`${quarterFights.length} quarts de finale détectés au lieu de 4 au plus.`);
  if (entrants.length >= 4 && semiFights.length < 2) {
    issues.push(`${semiFights.length ? "Une seule demi-finale détectée" : "Aucune demi-finale détectée"} pour 4 athlètes ou plus.`);
  }

  // Un quart de finale doit mener à une seule demi-finale.
  const quarterToSemi = new Map<string, Set<string>>();
  for (const e of entrants) {
    if (!e.quarter || !e.half) continue;
    quarterToSemi.set(e.quarter, (quarterToSemi.get(e.quarter) ?? new Set()).add(e.half));
  }
  for (const [quarter, semis] of quarterToSemi) {
    if (semis.size > 1) issues.push(`Le quart ${quarter} mène à plusieurs demi-finales (${[...semis].join(", ")}).`);
  }
  // Une demi-finale reçoit au plus deux quarts.
  const semiToQuarters = new Map<string, Set<string>>();
  for (const [quarter, semis] of quarterToSemi) {
    for (const semi of semis) semiToQuarters.set(semi, (semiToQuarters.get(semi) ?? new Set()).add(quarter));
  }
  for (const [semi, quarters] of semiToQuarters) {
    if (quarters.size > 2) issues.push(`La demi-finale ${semi} reçoit ${quarters.size} quarts.`);
  }

  // Sur une feuille avec noms des deux côtés, chaque côté forme une moitié d'arbre.
  const leftHalves = new Set(entrants.filter((e) => e.side === "left").map((e) => e.half).filter(Boolean));
  const rightHalves = new Set(entrants.filter((e) => e.side === "right").map((e) => e.half).filter(Boolean));
  const bothSides = leftHalves.size > 0 && rightHalves.size > 0;
  if (bothSides && (leftHalves.size > 1 || rightHalves.size > 1 || [...leftHalves].some((h) => rightHalves.has(h)))) {
    issues.push("Les moitiés d'arbre ne correspondent pas aux côtés gauche et droit de la feuille.");
  }

  // À partir de 4 athlètes, tout le monde passe par une demi-finale.
  const incomplete = entrants.filter((e) => !e.half && entrants.length >= 4);
  if (incomplete.length) issues.push(`${incomplete.length} athlète(s) sans demi-finale dans le parcours.`);

  // Têtes de série : uniques dans la division.
  const seeds = entrants.map((e) => e.seed).filter((s): s is number => s !== undefined);
  const duplicates = seeds.filter((s, i) => seeds.indexOf(s) !== i);
  if (duplicates.length) issues.push(`Tête(s) de série en double : ${[...new Set(duplicates)].join(", ")}.`);
  // Les trous dans la numérotation sont normaux (forfaits, exempts) : pas d'anomalie.
  return issues;
}

/** Ordre de lecture d'une feuille : côté gauche de haut en bas, puis côté droit de haut en bas. */
function readingOrder(athletes: TeamAthlete[]): TeamAthlete[] {
  return [...athletes].sort((a, b) =>
    (a.side === b.side ? 0 : a.side === "left" ? -1 : 1)
    || a.page - b.page
    || (a.sourceBounds?.y ?? 0) - (b.sourceBounds?.y ?? 0));
}

/** Athlètes d'une division ; `pages` garde aussi la page de la finale, même quand elle ne fait que réimprimer des athlètes. */
type AthleteGroup = { athletes: TeamAthlete[]; pages: number[]; notes: string[] };

const identity = (athlete: TeamAthlete) => `${normalizeDrawText(athlete.name)}|${athlete.country ?? ""}`;

const endsWith = (path: string[], end: string[]) =>
  end.length > 0 && end.length <= path.length && end.every((fight, i) => path[path.length - end.length + i] === fight);

/** Même nom, éventuellement coupé au bord de la feuille : l'un commence par l'autre, sur 6 lettres au moins. */
function sameName(a: TeamAthlete, b: TeamAthlete): boolean {
  const [x, y] = [normalizeDrawText(a.name), normalizeDrawText(b.name)];
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 6 && long.startsWith(short);
}

/**
 * Athlète de la partie que la page de la finale réimprime : même nom et même pays ; sinon, nom coupé ou pays mal lu,
 * à condition d'un seul candidat au même début de nom, de même pays ou de même fin de parcours jusqu'au raccord.
 */
function reprintOf(carrier: TeamAthlete, part: TeamAthlete[], joint: string): TeamAthlete | undefined {
  const exact = part.find((p) => identity(p) === identity(carrier));
  if (exact) return exact;
  const upToJoint = carrier.path.slice(0, carrier.path.indexOf(joint) + 1);
  const candidates = part.filter((p) => sameName(p, carrier) && (p.country === carrier.country || endsWith(p.path, upToJoint)));
  return candidates.length === 1 ? candidates[0] : undefined;
}

/**
 * Raccorde une partie de tableau à la page de la finale qui la prolonge.
 * `carriers` : athlètes de la page de la finale dont le parcours passe par `joint`, la « finale » de la partie.
 */
function mergePart(top: AthleteGroup, part: AthleteGroup, joint: string, carriers: TeamAthlete[]): AthleteGroup {
  const tail = (a: TeamAthlete) => a.path.slice(a.path.indexOf(joint) + 1);
  const suffix = tail(carriers[0]);
  const notes = [...top.notes, ...part.notes];
  if (carriers.some((c) => tail(c).join(" ") !== suffix.join(" "))) {
    notes.push(`Après le combat ${joint}, les parcours de la page de la finale ne mènent pas tous au même combat.`);
  }
  // La page de la finale réimprime les exempts (et les vainqueurs) des pages de moitié : ce ne sont pas de nouveaux athlètes.
  const reprinted = new Set(carriers.filter((c) => reprintOf(c, part.athletes, joint)));
  const unknown = carriers.length - reprinted.size;
  if (unknown) notes.push(`${unknown} athlète(s) de la page de la finale absent(s) de la partie qui mène au combat ${joint}.`);

  const extended = part.athletes.map((a) => ({ ...a, side: carriers[0].side, path: [...a.path, ...suffix] }));
  const firstCarrier = top.athletes.findIndex((a) => carriers.includes(a));
  const kept = top.athletes.filter((a) => !reprinted.has(a));
  const before = top.athletes.slice(0, firstCarrier).filter((a) => !reprinted.has(a)).length;
  const pages = [...new Set([...top.pages, ...part.pages])].sort((a, b) => a - b);
  return { athletes: [...kept.slice(0, before), ...extended, ...kept.slice(before)], pages, notes };
}

/**
 * Tableaux coupés sur plusieurs pages (TaekoPlan « Page 1 of 3 ») : chaque page de moitié s'arrête à un combat
 * que la page de la finale reprend plus loin dans ses parcours (une demi-finale, en général).
 * On prolonge les parcours de la partie jusqu'à la finale, on reprend le côté de la page de la finale
 * et on écarte les athlètes que cette page réimprime. Rien n'est inventé : sans combat commun, pas de raccord.
 */
function linkContinuationPages(groups: TeamAthlete[][]): AthleteGroup[] {
  let pending: AthleteGroup[] = groups.map((athletes) => ({
    athletes: readingOrder(athletes), pages: [...new Set(athletes.map((a) => a.page))].sort((a, b) => a - b), notes: [],
  }));
  for (;;) {
    let link: { top: AthleteGroup; part: AthleteGroup; joint: string; carriers: TeamAthlete[] } | undefined;
    for (const top of pending) {
      for (const part of pending) {
        const joint = part.athletes[0]?.path.at(-1);
        if (part === top || !joint || part.athletes[0].category !== top.athletes[0].category) continue;
        if (part.pages.some((page) => top.pages.includes(page))) continue;
        const carriers = top.athletes.filter((a) => a.path.slice(0, -1).includes(joint));
        if (carriers.length) { link = { top, part, joint, carriers }; break; }
      }
      if (link) break;
    }
    if (!link) return pending;
    const { top, part, joint, carriers } = link;
    pending = [...pending.filter((g) => g !== top && g !== part), mergePart(top, part, joint, carriers)];
  }
}

export function buildBrackets(index: TeamDrawAnalysis): BracketDivision[] {
  const groups = new Map<string, TeamAthlete[]>();
  for (const athlete of index.athletes) {
    const key = divisionKey(athlete);
    groups.set(key, [...(groups.get(key) ?? []), athlete]);
  }

  const divisions: BracketDivision[] = [];
  for (const { athletes: ordered, pages, notes } of linkContinuationPages([...groups.values()])) {
    const first = ordered[0];
    const key = divisionKey(first);
    const finalFight = first.path.at(-1);
    const athletes = ordered;

    const entrants: BracketEntrant[] = ordered.map((athlete, i) => ({
      athleteId: athlete.id,
      name: athlete.name,
      country: athlete.country,
      seed: athlete.seed,
      position: i + 1,
      side: athlete.side,
      page: athlete.page,
      path: athlete.path,
      half: fromEnd(athlete.path, 1),
      quarter: fromEnd(athlete.path, 2),
    }));

    const { semiFights, quarterFights } = bracketFights(entrants);
    const issues = checkBracket(entrants, finalFight);

    // Avertissements du moteur sur les athlètes de la division.
    const flagged = athletes.filter((a) => a.warnings.length).length;
    if (flagged) issues.push(`${flagged} athlète(s) signalé(s) par le moteur de lecture.`);
    issues.push(...notes);

    divisions.push({
      key,
      category: first.category,
      ageCategory: first.ageCategory,
      genderCategory: first.genderCategory,
      weightCategory: first.weightCategory,
      pages,
      finalFight,
      size: entrants.length,
      entrants,
      semiFights,
      quarterFights,
      status: issues.length ? "review" : "ok",
      issues,
    });
  }
  return divisions.sort((a, b) => a.pages[0] - b.pages[0] || a.key.localeCompare(b.key));
}
