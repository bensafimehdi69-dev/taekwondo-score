/**
 * Géométrie de la feuille de tirage, comme sur le PDF officiel : moitié haute à gauche, moitié basse à droite
 * (en miroir), finale au centre ; les athlètes dans les colonnes extérieures, puis une colonne par tour.
 * Fonction pure : le composant web ne fait que dessiner ces boîtes et ces traits.
 */
import type { BracketTree, TreeNode } from "./bracket-tree.ts";
import { PLAYABLE_LEVEL } from "./bracket-tree.ts";

export const SHEET = { row: 32, athleteWidth: 172, slotWidth: 124, chipWidth: 46, gap: 16, centerWidth: 128, top: 40, boxHeight: 26 };

export type SheetBox =
  | { kind: "athlete"; athleteId: string; x: number; y: number; w: number; side: "left" | "right" }
  | { kind: "slot"; key: string; code: string; level: number; x: number; y: number; w: number; side: "left" | "right" | "center" }
  | { kind: "chip"; code: string; x: number; y: number; w: number; side: "left" | "right" };

export type SheetLine = { x1: number; y1: number; x2: number; y2: number };
export type SheetLabel = { text: string; x: number; y: number; w: number };
export type SheetLayout = { width: number; height: number; boxes: SheetBox[]; lines: SheetLine[]; labels: SheetLabel[] };

const LABELS: Record<number, string> = { 3: "Quarts", 2: "Demies", 1: "Finale" };

const leavesOf = (node: TreeNode): TreeNode[] => (node.kind === "athlete" ? [node] : node.children.flatMap(leavesOf));

export function layoutSheet(tree: BracketTree): SheetLayout {
  const { row, athleteWidth, slotWidth, chipWidth, gap, centerWidth, top, boxHeight } = SHEET;
  const depth = Math.max(1, tree.depth);
  // Colonnes d'une moitié, de l'extérieur vers le centre : athlètes, puis un tour par colonne (niveau depth → 1).
  const columns = [{ level: depth + 1, w: athleteWidth }];
  for (let level = depth; level >= 1; level -= 1) columns.push({ level, w: level <= PLAYABLE_LEVEL ? slotWidth : chipWidth });
  const xs: number[] = [];
  let cursor = 0;
  for (const column of columns) { xs.push(cursor); cursor += column.w + gap; }
  const halfWidth = cursor - gap;
  const width = halfWidth * 2 + gap * 2 + centerWidth;
  const centerX = halfWidth + gap;
  const columnOf = (level: number) => columns.findIndex((c) => c.level === level);
  const xAt = (col: number, side: "left" | "right") => (side === "left" ? xs[col] : width - xs[col] - columns[col].w);

  const halves = tree.halves.slice(0, 2);
  const rows = halves.map((half) => leavesOf(half).length);
  const maxRows = Math.max(1, ...rows);
  const boxes: SheetBox[] = [];
  const lines: SheetLine[] = [];
  const position = new Map<string, { y: number; inner: number; outer: number }>();

  halves.forEach((half, h) => {
    const side = h === 0 ? "left" : "right";
    const offset = ((maxRows - rows[h]) / 2) * row;
    let index = 0;
    const place = (node: TreeNode): number => {
      if (node.kind === "athlete") {
        const y = top + offset + index * row + row / 2;
        index += 1;
        const x = xAt(0, side);
        boxes.push({ kind: "athlete", athleteId: node.entrant.athleteId, x, y, w: athleteWidth, side });
        position.set(node.id, { y, inner: side === "left" ? x + athleteWidth : x, outer: side === "left" ? x : x + athleteWidth });
        return y;
      }
      const ys = node.children.map(place);
      const y = ys.reduce((a, b) => a + b, 0) / ys.length;
      const col = columnOf(node.level);
      const w = columns[col].w;
      const x = xAt(col, side);
      boxes.push(node.level <= PLAYABLE_LEVEL
        ? { kind: "slot", key: node.id, code: node.code, level: node.level, x, y, w, side }
        : { kind: "chip", code: node.code, x, y, w, side });
      position.set(node.id, { y, inner: side === "left" ? x + w : x, outer: side === "left" ? x : x + w });
      for (const child of node.children) {
        const from = position.get(child.id)!;
        lines.push({ x1: from.inner, y1: from.y, x2: side === "left" ? x : x + w, y2: y });
      }
      return y;
    };
    place(half);
  });

  // Finale au centre : la case du vainqueur, reliée aux deux finalistes (vainqueurs des demies).
  const finalists = halves.map((half) => position.get(half.id));
  const centerY = finalists.filter(Boolean).reduce((sum, p) => sum + p!.y, 0) / Math.max(1, finalists.filter(Boolean).length) || top + row;
  boxes.push({ kind: "slot", key: tree.final.id, code: tree.final.code, level: 0, x: centerX, y: centerY, w: centerWidth, side: "center" });
  finalists.forEach((from, h) => {
    if (from) lines.push({ x1: from.inner, y1: from.y, x2: h === 0 ? centerX : centerX + centerWidth, y2: centerY });
  });

  const labels: SheetLabel[] = [];
  columns.forEach((column, col) => {
    const text = LABELS[column.level];
    if (!text) return;
    for (const side of ["left", "right"] as const) labels.push({ text, x: xAt(col, side), y: 14, w: column.w });
  });
  labels.push({ text: "Vainqueur", x: centerX, y: 14, w: centerWidth });
  const height = top + maxRows * row + boxHeight;
  return { width, height, boxes, lines, labels };
}

