/**
 * Reconstruction des arbres de Taekwondo Score à partir de l'index complet du moteur.
 *
 * Principe : le moteur donne, pour chaque athlète, son parcours potentiel jusqu'à la finale.
 * En lisant ce parcours depuis la fin (finale, demi, quart), on obtient pour chaque athlète
 * sa moitié et son quart d'arbre, sans relire la géométrie du PDF.
 *
 * Aucune valeur n'est forcée : toute incohérence met la division en « review ».
 */
import type { TeamAthlete, TeamDrawAnalysis } from "./team-path-parser.ts";

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

export function buildBrackets(index: TeamDrawAnalysis): BracketDivision[] {
  const groups = new Map<string, TeamAthlete[]>();
  for (const athlete of index.athletes) {
    const key = divisionKey(athlete);
    groups.set(key, [...(groups.get(key) ?? []), athlete]);
  }

  const divisions: BracketDivision[] = [];
  for (const [key, athletes] of groups) {
    const issues: string[] = [];
    const first = athletes[0];
    const finalFight = first.path.at(-1);
    if (!finalFight) issues.push("Aucun parcours relié : l'arbre ne peut pas être reconstruit.");

    const ordered = [...athletes].sort((a, b) =>
      (a.side === b.side ? 0 : a.side === "left" ? -1 : 1)
      || a.page - b.page
      || (a.sourceBounds?.y ?? 0) - (b.sourceBounds?.y ?? 0));

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

    const semiFights = [...new Set(entrants.map((e) => e.half).filter((v): v is string => !!v))];
    const quarterFights = [...new Set(entrants.map((e) => e.quarter).filter((v): v is string => !!v))];

    if (entrants.length < 2) issues.push("Moins de deux athlètes dans la division.");
    if (semiFights.length > MAX_SEMIS) issues.push(`${semiFights.length} demi-finales détectées au lieu de 2 au plus.`);
    if (quarterFights.length > MAX_QUARTERS) issues.push(`${quarterFights.length} quarts de finale détectés au lieu de 4 au plus.`);
    if (entrants.length >= 4 && semiFights.length < 2) issues.push("Une seule demi-finale détectée pour 4 athlètes ou plus.");

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

    // Avertissements du moteur sur les athlètes de la division.
    const flagged = athletes.filter((a) => a.warnings.length).length;
    if (flagged) issues.push(`${flagged} athlète(s) signalé(s) par le moteur de lecture.`);

    divisions.push({
      key,
      category: first.category,
      ageCategory: first.ageCategory,
      genderCategory: first.genderCategory,
      weightCategory: first.weightCategory,
      pages: [...new Set(athletes.map((a) => a.page))].sort((a, b) => a - b),
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
