/**
 * Corrections manuelles d'une division sur l'écran de contrôle de l'admin.
 *
 * Fonctions pures : chaque correction renvoie une nouvelle division et rejoue les contrôles de structure.
 * Les alertes de lecture (moteur, contrôle d'import) ne disparaissent jamais d'elles-mêmes :
 * seule la validation humaine les lève.
 */
import { bracketFights, checkBracket, type BracketDivision, type BracketEntrant } from "./bracket-builder.ts";

export type EntrantPatch = Partial<Pick<BracketEntrant, "name" | "country" | "seed" | "half" | "quarter">>;

/** Alertes venues de la lecture du PDF, et non de la structure de l'arbre. */
export function readingIssues(division: BracketDivision): string[] {
  const structural = new Set(checkBracket(division.entrants, division.finalFight));
  return division.issues.filter((issue) => !structural.has(issue));
}

function withEntrants(division: BracketDivision, entrants: BracketEntrant[], finalFight = division.finalFight): BracketDivision {
  const reading = readingIssues(division);
  const renumbered = entrants.map((e, i) => ({ ...e, position: i + 1 }));
  const issues = [...checkBracket(renumbered, finalFight), ...reading];
  return { ...division, finalFight, entrants: renumbered, ...bracketFights(renumbered), size: renumbered.length,
    issues, status: issues.length ? "review" : "ok" };
}

/** Remplace la liste des athlètes (ex. ajouts de la vérification du PDF) en rejouant les contrôles de structure. */
export function replaceEntrants(division: BracketDivision, entrants: BracketEntrant[]): BracketDivision {
  return withEntrants(division, entrants);
}

const clean = (value: string | undefined) => value?.trim() || undefined;

/** Recale le parcours (quart, demi, finale) et le côté de la feuille après un changement de place. */
function withPlacement(division: BracketDivision, before: BracketEntrant, after: BracketEntrant): BracketEntrant {
  if (after.half === before.half && after.quarter === before.quarter) return after;
  const early = before.path.slice(0, Math.max(0, before.path.length - 3));
  const final = division.finalFight ?? before.path.at(-1);
  const path = [...early, after.quarter, after.half, final].filter((f): f is string => !!f);
  const sameHalf = division.entrants.find((e) => e.athleteId !== after.athleteId && e.half && e.half === after.half);
  return { ...after, path, side: sameHalf?.side ?? after.side };
}

export function updateEntrant(division: BracketDivision, athleteId: string, patch: EntrantPatch): BracketDivision {
  const entrants = division.entrants.map((e) => {
    if (e.athleteId !== athleteId) return e;
    const next: BracketEntrant = { ...e };
    if ("name" in patch) next.name = patch.name ?? "";
    if ("country" in patch) next.country = clean(patch.country)?.toUpperCase();
    if ("seed" in patch) next.seed = patch.seed !== undefined && Number.isInteger(patch.seed) && patch.seed > 0 ? patch.seed : undefined;
    if ("half" in patch) next.half = clean(patch.half);
    if ("quarter" in patch) next.quarter = clean(patch.quarter);
    return withPlacement(division, e, next);
  });
  return withEntrants(division, entrants);
}

/** Corrige le combat de finale, absent quand la lecture n'a relié aucun parcours. */
export function setFinalFight(division: BracketDivision, finalFight: string | undefined): BracketDivision {
  const final = clean(finalFight);
  const entrants = division.entrants.map((e) => {
    const base = division.finalFight && e.path.at(-1) === division.finalFight ? e.path.slice(0, -1) : e.path;
    return { ...e, path: final ? [...base, final] : base };
  });
  return withEntrants(division, entrants, final);
}

export type CategoryPatch = Partial<Pick<BracketDivision, "ageCategory" | "genderCategory" | "weightCategory">>;

/**
 * Corrige la catégorie (âge, genre, poids), par exemple quand la feuille n'imprime pas l'âge (« To confirm » au Grand Prix).
 * Rien n'est deviné : une valeur vide redevient « To confirm ».
 */
export function setCategory(division: BracketDivision, patch: CategoryPatch): BracketDivision {
  const next = { ...division };
  for (const key of ["ageCategory", "genderCategory", "weightCategory"] as const) {
    if (key in patch) next[key] = patch[key]?.trim() || "To confirm";
  }
  return { ...next, category: `${next.ageCategory} · ${next.genderCategory} · ${next.weightCategory}` };
}

/** Déplace un athlète d'un cran dans l'ordre de lecture de l'arbre. */
export function moveEntrant(division: BracketDivision, athleteId: string, delta: -1 | 1): BracketDivision {
  const from = division.entrants.findIndex((e) => e.athleteId === athleteId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= division.entrants.length) return division;
  const entrants = [...division.entrants];
  [entrants[from], entrants[to]] = [entrants[to], entrants[from]];
  return withEntrants(division, entrants);
}

export function removeEntrant(division: BracketDivision, athleteId: string): BracketDivision {
  return withEntrants(division, division.entrants.filter((e) => e.athleteId !== athleteId));
}

/** Ajoute un athlète oublié par la lecture, placé après les athlètes du même quart (ou de la même moitié). */
export function addEntrant(division: BracketDivision, placement: { half?: string; quarter?: string }): { division: BracketDivision; athleteId: string } {
  let n = 1;
  while (division.entrants.some((e) => e.athleteId === `manuel-${n}`)) n += 1;
  const athleteId = `manuel-${n}`;
  const half = clean(placement.half);
  const quarter = clean(placement.quarter);
  const neighbour = division.entrants.findLast((e) => (quarter ? e.quarter === quarter : e.half === half));
  const entrant: BracketEntrant = {
    athleteId, name: "", position: 0, side: neighbour?.side ?? "left", page: neighbour?.page ?? division.pages[0] ?? 1,
    path: [quarter, half, division.finalFight].filter((f): f is string => !!f), half, quarter,
  };
  const at = neighbour ? division.entrants.indexOf(neighbour) + 1 : division.entrants.length;
  const entrants = [...division.entrants.slice(0, at), entrant, ...division.entrants.slice(at)];
  return { division: withEntrants(division, entrants), athleteId };
}

const FIELDS = ["name", "country", "seed", "half", "quarter"] as const;

/** Nombre de corrections par rapport à la lecture d'origine : catégorie, finale, athlètes ajoutés, retirés ou modifiés, et ordre changé. */
export function countCorrections(original: BracketDivision, current: BracketDivision): number {
  const before = new Map(original.entrants.map((e) => [e.athleteId, e]));
  const after = new Map(current.entrants.map((e) => [e.athleteId, e]));
  let corrections = (original.finalFight === current.finalFight ? 0 : 1) + (original.category === current.category ? 0 : 1);
  for (const [id, e] of after) {
    const o = before.get(id);
    if (!o || FIELDS.some((field) => (o[field] ?? undefined) !== (e[field] ?? undefined))) corrections += 1;
  }
  for (const id of before.keys()) if (!after.has(id)) corrections += 1;
  const kept = (d: BracketDivision, other: Map<string, BracketEntrant>) =>
    d.entrants.filter((e) => other.has(e.athleteId)).map((e) => e.athleteId).join("\n");
  if (kept(original, after) !== kept(current, before)) corrections += 1;
  return corrections;
}
