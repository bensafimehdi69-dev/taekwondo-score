/**
 * Règles de pronostic et barème de Taekwondo Score (cahier des charges, sections 6 et 7).
 * Fonctions pures, sans stockage : utilisables côté API comme côté client.
 * Les valeurs du barème sont une proposition à valider : elles sont regroupées dans DEFAULT_SCORING.
 */
import type { BracketDivision, BracketEntrant } from "./bracket-builder.ts";

export type Place = "gold" | "silver" | "bronze" | "quarter";
export type Pick = { athleteId: string; place: Place };
/** Classement réel saisi par l'admin. `quarter` = athlètes battus en quart de finale. */
export type DivisionResult = { gold: string; silver: string; bronze: string[]; quarter: string[] };

export type ScoringConfig = {
  base: Record<Place, number>;
  /** Bon athlète dans le top 8 réel, mais à une autre place que celle pronostiquée. */
  partial: number;
  /** Tête de série qui fait mieux que sa place attendue (ex. seed 6 vainqueur). */
  bonusBetterSeed: number;
  /** Athlète non tête de série. */
  bonusUnseeded: number;
};

export const DEFAULT_SCORING: ScoringConfig = {
  base: { gold: 10, silver: 8, bronze: 6, quarter: 3 },
  partial: 1,
  bonusBetterSeed: 0.5,
  bonusUnseeded: 1,
};

const PLACE_RANK: Record<Place, number> = { gold: 1, silver: 2, bronze: 3, quarter: 4 };

/** Place attendue d'une tête de série : 1 → or, 2 → argent, 3-4 → bronze, 5-8 → quart, au-delà → hors top 8. */
export function expectedRankForSeed(seed: number): number {
  if (seed <= 1) return 1;
  if (seed === 2) return 2;
  if (seed <= 4) return 3;
  if (seed <= 8) return 4;
  return 5;
}

/** Nombre de places à pronostiquer, selon ce que l'arbre permet réellement. */
export function expectedPicks(division: BracketDivision): Record<Place, number> {
  return {
    gold: division.size >= 2 ? 1 : 0,
    silver: division.size >= 2 ? 1 : 0,
    bronze: division.semiFights.length,
    quarter: division.quarterFights.length,
  };
}

const quarterKey = (entrant: BracketEntrant) => entrant.quarter ?? `bye:${entrant.athleteId}`;

export function validatePrediction(
  division: BracketDivision,
  picks: Pick[],
  options: { requireComplete?: boolean } = {},
): { valid: boolean; issues: string[] } {
  const requireComplete = options.requireComplete ?? true;
  const issues: string[] = [];
  const byId = new Map(division.entrants.map((e) => [e.athleteId, e]));

  const seen = new Set<string>();
  for (const pick of picks) {
    if (!byId.has(pick.athleteId)) issues.push(`Athlète inconnu dans cette division : ${pick.athleteId}.`);
    if (seen.has(pick.athleteId)) issues.push(`${byId.get(pick.athleteId)?.name ?? pick.athleteId} occupe plusieurs places.`);
    seen.add(pick.athleteId);
  }

  const expected = expectedPicks(division);
  for (const place of Object.keys(expected) as Place[]) {
    const count = picks.filter((p) => p.place === place).length;
    if (count > expected[place]) issues.push(`${count} choix pour « ${place} », ${expected[place]} au maximum.`);
    if (requireComplete && count < expected[place]) issues.push(`${expected[place] - count} choix manquant(s) pour « ${place} ».`);
  }

  const entrantOf = (pick: Pick) => byId.get(pick.athleteId);
  const finalists = picks.filter((p) => p.place === "gold" || p.place === "silver").map(entrantOf).filter(Boolean) as BracketEntrant[];
  const bronzes = picks.filter((p) => p.place === "bronze").map(entrantOf).filter(Boolean) as BracketEntrant[];
  const medalists = [...finalists, ...bronzes];

  // Chaque moitié d'arbre donne un seul finaliste et un seul médaillé de bronze.
  const countBy = (list: BracketEntrant[], key: (e: BracketEntrant) => string | undefined) => {
    const counts = new Map<string, number>();
    for (const e of list) { const k = key(e); if (k) counts.set(k, (counts.get(k) ?? 0) + 1); }
    return counts;
  };
  for (const [, n] of countBy(finalists, (e) => e.half)) {
    if (n > 1) issues.push("Le vainqueur et le finaliste viennent de la même moitié d'arbre : ils ne peuvent pas se rencontrer en finale.");
  }
  for (const [, n] of countBy(bronzes, (e) => e.half)) {
    if (n > 1) issues.push("Deux médaillés de bronze viennent de la même moitié d'arbre.");
  }

  // Chaque quart d'arbre donne un seul demi-finaliste (médaillé) et un seul battu en quart.
  for (const [, n] of countBy(medalists, quarterKey)) {
    if (n > 1) issues.push("Deux médaillés viennent du même quart d'arbre : un seul peut atteindre les demi-finales.");
  }
  const quarterPicks = picks.filter((p) => p.place === "quarter").map(entrantOf).filter(Boolean) as BracketEntrant[];
  for (const e of quarterPicks) {
    if (!e.quarter) issues.push(`${e.name} entre directement en demi-finale : il ne peut pas être battu en quart.`);
  }
  for (const [, n] of countBy(quarterPicks, (e) => e.quarter)) {
    if (n > 1) issues.push("Deux battus en quart viennent du même quart de finale.");
  }
  // Les deux adversaires d'un quart viennent de ses deux branches (huitièmes) : deux athlètes de la même branche
  // se rencontrent avant les quarts. Un athlète qui entre directement en quart forme sa propre branche.
  const branch = (e: BracketEntrant) => (e.quarter ? `${e.quarter}|${e.path[e.path.length - 4] ?? `direct:${e.athleteId}`}` : undefined);
  for (const [, n] of countBy([...medalists, ...quarterPicks], branch)) {
    if (n > 1) issues.push("Deux quarts de finalistes viennent de la même branche : ils se rencontrent avant les quarts.");
  }
  if (requireComplete) {
    const medalQuarters = new Set(medalists.map(quarterKey));
    for (const e of quarterPicks) {
      if (e.quarter && !medalQuarters.has(e.quarter)) issues.push(`${e.name} est battu en quart, mais aucun médaillé ne sort de son quart d'arbre.`);
    }
  }

  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}

export function resultToPicks(result: DivisionResult): Pick[] {
  return [
    { athleteId: result.gold, place: "gold" },
    { athleteId: result.silver, place: "silver" },
    ...result.bronze.map((athleteId): Pick => ({ athleteId, place: "bronze" })),
    ...result.quarter.map((athleteId): Pick => ({ athleteId, place: "quarter" })),
  ];
}

/** Même contrôle de cohérence sur le classement saisi par l'admin. */
export function validateResult(division: BracketDivision, result: DivisionResult) {
  return validatePrediction(division, resultToPicks(result));
}

export type ScoredPick = Pick & { actual?: Place; base: number; bonus: number; points: number };

export function scorePrediction(
  division: BracketDivision,
  picks: Pick[],
  result: DivisionResult,
  config: ScoringConfig = DEFAULT_SCORING,
): { total: number; exactGolds: number; lines: ScoredPick[] } {
  const actualPlace = new Map(resultToPicks(result).map((p) => [p.athleteId, p.place]));
  const seedOf = new Map(division.entrants.map((e) => [e.athleteId, e.seed]));
  const lines = picks.map((pick): ScoredPick => {
    const actual = actualPlace.get(pick.athleteId);
    if (actual === pick.place) {
      const base = config.base[pick.place];
      const seed = seedOf.get(pick.athleteId);
      const rate = seed === undefined
        ? config.bonusUnseeded
        : PLACE_RANK[pick.place] < expectedRankForSeed(seed) ? config.bonusBetterSeed : 0;
      return { ...pick, actual, base, bonus: base * rate, points: base * (1 + rate) };
    }
    if (actual) return { ...pick, actual, base: config.partial, bonus: 0, points: config.partial };
    return { ...pick, base: 0, bonus: 0, points: 0 };
  });
  return {
    total: lines.reduce((sum, l) => sum + l.points, 0),
    exactGolds: lines.filter((l) => l.place === "gold" && l.actual === "gold").length,
    lines,
  };
}

export type LeaderboardRow = { userId: string; points: number; exactGolds: number; registeredAt: string };

/** Cumul brut ; départage : vainqueurs exacts, puis inscription la plus ancienne. */
export function rankLeaderboard(rows: LeaderboardRow[]): Array<LeaderboardRow & { rank: number }> {
  const sorted = [...rows].sort((a, b) =>
    b.points - a.points || b.exactGolds - a.exactGolds || a.registeredAt.localeCompare(b.registeredAt));
  return sorted.map((row, i) => ({ ...row, rank: i + 1 }));
}
