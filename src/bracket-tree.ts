/**
 * Arbre de tirage « comme sur la feuille » et pronostic par place (choix de Mehdi du 23/09/2026) :
 * le joueur donne une place à un athlète (1er, 2e, 3e, battu en quart) et son chemin se dessine dans l'arbre.
 * Un choix qui contredit l'arbre ne crée jamais d'incohérence : le plus récent l'emporte, les autres s'adaptent
 * (l'athlète battu plus tôt descend de place ; un second perdant du même combat est retiré).
 *
 * Niveaux comptés depuis la finale : 0 = finale, 1 = demi-finale, 2 = quart, 3 = huitième, 4 = seizième…
 * Une case « vainqueur de X » est jouable pour X de niveau 0 à 3 (vainqueur d'un huitième = quart de finaliste).
 */
import type { BracketDivision, BracketEntrant } from "./bracket-builder.ts";
import type { Places } from "./model.ts";
import type { Place } from "./prediction.ts";

export type TreeLeaf = { kind: "athlete"; id: string; entrant: BracketEntrant };
export type TreeFight = { kind: "fight"; id: string; code: string; level: number; children: TreeNode[] };
export type TreeNode = TreeLeaf | TreeFight;

export type BracketTree = {
  final: TreeFight;
  /** Les deux moitiés (sous-arbres des demi-finales), dans l'ordre de la feuille : haut/gauche puis bas/droite. */
  halves: TreeNode[];
  /** Profondeur maximale (niveau du premier tour), pour aligner les athlètes dans la colonne extérieure. */
  depth: number;
  parent: Map<string, TreeFight>;
  leaves: Map<string, TreeLeaf>;
};

/** Case « vainqueur du nœud X » : l'athlète qui sort de ce sous-arbre. Clé stable, stockable. */
export type TreeState = Record<string, string>;

export const PLAYABLE_LEVEL = 3;

/** Reconstruit l'arbre à partir des parcours (numéros de combat) de chaque athlète. */
export function buildTree(division: BracketDivision): BracketTree {
  const fights = new Map<string, TreeFight>();
  const parent = new Map<string, TreeFight>();
  const leaves = new Map<string, TreeLeaf>();
  const finalCode = division.finalFight ?? "finale";
  const fight = (code: string, level: number) => {
    let node = fights.get(code);
    if (!node) fights.set(code, node = { kind: "fight", id: code, code, level, children: [] });
    return node;
  };
  const final = fight(finalCode, 0);
  let depth = 0;
  for (const entrant of division.entrants) {
    // Parcours depuis la finale : [finale, demie, quart, …, premier combat].
    const path = [...entrant.path].reverse();
    if (path[0] !== finalCode) path.unshift(finalCode);
    let current = final;
    for (let level = 1; level < path.length; level += 1) {
      const next = fight(path[level], level);
      if (!current.children.includes(next)) {
        current.children.push(next);
        parent.set(next.id, current);
      }
      current = next;
    }
    depth = Math.max(depth, current.level);
    const leaf: TreeLeaf = { kind: "athlete", id: `athlete:${entrant.athleteId}`, entrant };
    current.children.push(leaf);
    parent.set(leaf.id, current);
    leaves.set(entrant.athleteId, leaf);
  }
  return { final, halves: final.children, depth, parent, leaves };
}

const isFight = (node: TreeNode): node is TreeFight => node.kind === "fight";

/** Chaîne des cases jouables qu'un athlète peut occuper, de la plus basse (quart de finaliste) au titre. */
export function chainOf(tree: BracketTree, athleteId: string): string[] {
  const leaf = tree.leaves.get(athleteId);
  if (!leaf) return [];
  const chain: string[] = [];
  let node: TreeNode = leaf;
  let up = tree.parent.get(node.id);
  while (up) {
    // « Vainqueur de node » n'est une case que pour un combat de niveau ≤ 3 ; un athlète est son propre vainqueur.
    if (isFight(node) && node.level <= PLAYABLE_LEVEL) chain.push(node.id);
    node = up;
    up = tree.parent.get(node.id);
  }
  chain.push(tree.final.id);
  return chain;
}

/** Tour atteint pour une place : 0 = quart de finaliste, 1 = demi-finaliste, 2 = finaliste, 3 = vainqueur. */
export const REACH: Record<Place, number> = { quarter: 0, bronze: 1, silver: 2, gold: 3 };
const PLACE_OF_REACH: Place[] = ["quarter", "bronze", "silver", "gold"];

/** Tour correspondant à chaque case de la chaîne : la dernière vaut 3 (vainqueur), puis 2, 1, 0. */
const roundAt = (chain: string[], index: number) => 3 - (chain.length - 1 - index);

/** Places possibles pour un athlète : un exempt qui entre en demie ne peut pas être battu en quart. */
export function allowedPlaces(tree: BracketTree, athleteId: string): Place[] {
  const chain = chainOf(tree, athleteId);
  if (!chain.length) return [];
  return PLACE_OF_REACH.filter((place) => {
    const reach = REACH[place];
    return reach === 3 || chain.some((_, i) => roundAt(chain, i) === reach + 1);
  });
}

export type PlaceChange = { athleteId: string; from: Place; to?: Place };

/**
 * Donne une place à un athlète (null = la retirer) et rend l'arbre cohérent. Le nouveau choix est prioritaire :
 * un athlète qui lui barre la route est battu à ce tour (il descend de place) ; deux perdants du même combat
 * sont impossibles (le plus ancien est retiré). `changes` liste les autres athlètes touchés.
 */
export function setPlace(tree: BracketTree, places: Places, athleteId: string, place: Place | null): { places: Places; changes: PlaceChange[] } {
  const previous = new Map<string, Place>();
  for (const p of PLACE_OF_REACH) for (const id of places[p]) previous.set(id, p);
  const order: Array<[string, Place]> = [
    ...(place ? [[athleteId, place] as [string, Place]] : []),
    ...[...previous].filter(([id]) => id !== athleteId),
  ];
  const occupied = new Map<string, string>();
  const losers = new Set<string>();
  const accepted = new Map<string, Place>();
  for (const [id, wanted] of order) {
    const chain = chainOf(tree, id);
    if (!chain.length) continue;
    let reach = REACH[wanted];
    while (reach >= 0) {
      const keys = chain.filter((_, i) => roundAt(chain, i) <= reach);
      const blocked = keys.find((key) => occupied.has(key));
      if (blocked) { reach = roundAt(chain, chain.indexOf(blocked)) - 1; continue; }
      // Le combat perdu : celui dont le vainqueur occupe la case du tour suivant ; un seul perdant par combat.
      const lostAt = reach < 3 ? chain.find((_, i) => roundAt(chain, i) === reach + 1) : undefined;
      if ((reach < 3 && !lostAt) || (lostAt && losers.has(lostAt))) { reach = -1; break; }
      for (const key of keys) occupied.set(key, id);
      if (lostAt) losers.add(lostAt);
      accepted.set(id, PLACE_OF_REACH[reach]);
      break;
    }
  }
  // Ordre stable : ceux qui gardent leur place d'abord, puis ceux qui en changent.
  const next: Places = { gold: [], silver: [], bronze: [], quarter: [] };
  for (const [id, p] of previous) if (accepted.get(id) === p) next[p].push(id);
  for (const [id, p] of accepted) if (previous.get(id) !== p) next[p].push(id);
  const changes: PlaceChange[] = [];
  for (const [id, before] of previous) {
    if (id === athleteId) continue;
    const after = accepted.get(id);
    if (after !== before) changes.push({ athleteId: id, from: before, ...(after ? { to: after } : {}) });
  }
  return { places: next, changes };
}

/** Participants d'un combat : un athlète entrant directement, ou le vainqueur choisi du sous-arbre. */
export function participants(state: TreeState, node: TreeFight): Array<string | undefined> {
  return node.children.map((child) => (isFight(child) ? state[child.id] : child.entrant.athleteId));
}

function fightsAt(tree: BracketTree, level: number): TreeFight[] {
  const found: TreeFight[] = [];
  const walk = (node: TreeNode) => {
    if (!isFight(node)) return;
    if (node.level === level) found.push(node);
    else node.children.forEach(walk);
  };
  walk(tree.final);
  return found;
}

const loserOf = (state: TreeState, node: TreeFight) => {
  const winner = state[node.id];
  if (!winner) return undefined;
  return participants(state, node).find((athlete) => athlete && athlete !== winner);
};

/**
 * Places déduites d'un arbre (sert à vérifier `stateFromPlaces`). Seul ce qui est décidé compte : un battu en quart
 * n'existe qu'une fois le vainqueur de son quart connu, un finaliste qu'une fois le vainqueur de la finale connu.
 */
export function placesFromState(tree: BracketTree, state: TreeState): Places {
  const gold = state[tree.final.id];
  const silver = loserOf(state, tree.final);
  const bronze = fightsAt(tree, 1).map((semi) => loserOf(state, semi)).filter((a): a is string => !!a);
  const quarter = fightsAt(tree, 2).map((quarterFight) => loserOf(state, quarterFight)).filter((a): a is string => !!a);
  return { gold: gold ? [gold] : [], silver: silver ? [silver] : [], bronze, quarter };
}

/**
 * Arbre dessiné depuis les places (pronostic, résultat) : chaque athlète occupe les cases de sa branche
 * jusqu'au tour atteint. Une place incohérente (ancien pronostic) est ignorée.
 */
export function stateFromPlaces(tree: BracketTree, places: Places): TreeState {
  const reach: Array<[string, number]> = [
    ...places.gold.map((id) => [id, 3] as [string, number]),
    ...places.silver.map((id) => [id, 2] as [string, number]),
    ...places.bronze.map((id) => [id, 1] as [string, number]),
    ...places.quarter.map((id) => [id, 0] as [string, number]),
  ];
  const state: TreeState = {};
  for (const [athleteId, depth] of reach) {
    const chain = chainOf(tree, athleteId);
    // La chaîne se termine toujours par le titre : la dernière case vaut le tour 3 (vainqueur), l'avant-dernière
    // le tour 2 (finaliste), puis 1 (demi-finaliste) et 0 (quart de finaliste). Un exempt a une chaîne plus courte.
    const keys = chain.filter((_, i) => roundAt(chain, i) <= depth);
    if (keys.some((key) => state[key] && state[key] !== athleteId)) continue;
    for (const key of keys) state[key] = athleteId;
  }
  return state;
}

/** Nombre de choix à faire pour un pronostic complet : un par case jouable. */
export function playableSlots(tree: BracketTree): string[] {
  const keys: string[] = [];
  const walk = (node: TreeNode) => {
    if (!isFight(node)) return;
    if (node.level <= PLAYABLE_LEVEL) keys.push(node.id);
    if (node.level < PLAYABLE_LEVEL) node.children.forEach(walk);
  };
  walk(tree.final);
  return keys;
}

/** Pronostic relu sur un tirage peut-être corrigé depuis : les places devenues impossibles sont retirées. */
export function sanitizePlaces(tree: BracketTree, places: Places): Places {
  let clean: Places = { gold: [], silver: [], bronze: [], quarter: [] };
  for (const p of ["gold", "silver", "bronze", "quarter"] as Place[]) {
    for (const id of places[p]) {
      if (!allowedPlaces(tree, id).includes(p) || PLACE_OF_REACH.some((q) => clean[q].includes(id))) continue;
      const attempt = setPlace(tree, clean, id, p);
      if (attempt.places[p].includes(id) && !attempt.changes.length) clean = attempt.places;
    }
  }
  return clean;
}
