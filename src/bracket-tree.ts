/**
 * Arbre de tirage « comme sur la feuille » et pronostic par avancement (choix de Mehdi du 23/09/2026) :
 * le joueur fait avancer les athlètes à partir des quarts de finale (quarts, demies, finale, vainqueur) ;
 * chaque case n'accepte que les athlètes de sa branche, les incohérences sont donc impossibles.
 * Les places (vainqueur, finaliste, bronze, battus en quart) se déduisent de l'arbre.
 *
 * Niveaux comptés depuis la finale : 0 = finale, 1 = demi-finale, 2 = quart, 3 = huitième, 4 = seizième…
 * Une case « vainqueur de X » est jouable pour X de niveau 0 à 3 (vainqueur d'un huitième = quart de finaliste).
 */
import type { BracketDivision, BracketEntrant } from "./bracket-builder.ts";
import type { Places } from "./model.ts";

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

/** Retire un athlète de toutes les cases au-dessus de `from` (incluse). */
function purge(tree: BracketTree, state: TreeState, athleteId: string, from: string): TreeState {
  const chain = chainOf(tree, athleteId);
  const start = chain.indexOf(from);
  if (start < 0) return state;
  const next = { ...state };
  for (const key of chain.slice(start)) if (next[key] === athleteId) delete next[key];
  return next;
}

function place(tree: BracketTree, state: TreeState, key: string, athleteId: string): TreeState {
  const previous = state[key];
  const next = previous && previous !== athleteId ? purge(tree, state, previous, key) : { ...state };
  next[key] = athleteId;
  return next;
}

/** Fait avancer un athlète d'un tour : la première case de sa branche qu'il n'occupe pas encore. */
export function advance(tree: BracketTree, state: TreeState, athleteId: string): TreeState {
  const key = chainOf(tree, athleteId).find((k) => state[k] !== athleteId);
  return key ? place(tree, state, key, athleteId) : state;
}

/** Vide une case : son occupant disparaît aussi des tours suivants. */
export function clearSlot(tree: BracketTree, state: TreeState, key: string): TreeState {
  const occupant = state[key];
  return occupant ? purge(tree, state, occupant, key) : state;
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
 * Places déduites de l'arbre. Seul ce qui est décidé compte : un battu en quart n'existe qu'une fois
 * le vainqueur de son quart choisi, un finaliste qu'une fois le vainqueur de la finale choisi.
 */
export function placesFromState(tree: BracketTree, state: TreeState): Places {
  const gold = state[tree.final.id];
  const silver = loserOf(state, tree.final);
  const bronze = fightsAt(tree, 1).map((semi) => loserOf(state, semi)).filter((a): a is string => !!a);
  const quarter = fightsAt(tree, 2).map((quarterFight) => loserOf(state, quarterFight)).filter((a): a is string => !!a);
  return { gold: gold ? [gold] : [], silver: silver ? [silver] : [], bronze, quarter };
}

/**
 * Arbre reconstitué depuis des places (pronostic enregistré, résultat saisi) : chaque athlète occupe
 * les cases de sa branche jusqu'au tour atteint. Une place incohérente (ancien pronostic) est ignorée.
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
    const keys = chain.filter((_, i) => 3 - (chain.length - 1 - i) <= depth);
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

/** Arbre enregistré relu sur un tirage peut-être corrigé depuis : seules les cases encore valables sont gardées. */
export function sanitizeState(tree: BracketTree, state: TreeState | undefined): TreeState {
  const clean: TreeState = {};
  for (const [key, athleteId] of Object.entries(state ?? {})) {
    if (chainOf(tree, athleteId).includes(key)) clean[key] = athleteId;
  }
  // Une case n'a de sens que si son occupant tient aussi les cases précédentes de sa branche (répété jusqu'à stabilité).
  for (let changed = true; changed;) {
    changed = false;
    for (const [key, athleteId] of Object.entries(clean)) {
      const chain = chainOf(tree, athleteId);
      if (chain.slice(0, chain.indexOf(key)).some((previous) => clean[previous] !== athleteId)) { delete clean[key]; changed = true; }
    }
  }
  return clean;
}
