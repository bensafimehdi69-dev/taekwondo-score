// Tableau synthétique de 8 : quarts 101-104, demis 201-202, finale 301.
const athlete = (id, side, y, path, seed) => ({
  id, name: id, team: "", country: "XXX", category: "Senior Men -58 kg", ageCategory: "Senior",
  genderCategory: "Men", weightCategory: "-58 kg", page: 1, side, startFight: path[0], path,
  confidence: 0.9, warnings: [], sourceText: id, drawFormat: "wt",
  sourceBounds: { x: side === "left" ? 30 : 770, y, width: 150, height: 8 },
  ...(seed ? { seed } : {}),
});
export const draw8 = () => ({ pageCount: 1, ocrPageCount: 0, warnings: [], athletes: [
  athlete("A", "left", 100, ["101", "201", "301"], 1), athlete("B", "left", 150, ["101", "201", "301"]),
  athlete("C", "left", 200, ["102", "201", "301"], 3), athlete("D", "left", 250, ["102", "201", "301"]),
  athlete("E", "right", 100, ["103", "202", "301"]), athlete("F", "right", 150, ["103", "202", "301"], 4),
  athlete("G", "right", 200, ["104", "202", "301"]), athlete("H", "right", 250, ["104", "202", "301"], 2),
] });
// Tableau de 6 avec deux exempts qui entrent directement en demi-finale.
export const draw6 = () => ({ pageCount: 1, ocrPageCount: 0, warnings: [], athletes: [
  athlete("A", "left", 100, ["101", "201", "301"], 1), athlete("B", "left", 150, ["101", "201", "301"]),
  athlete("C", "left", 200, ["201", "301"]),
  athlete("D", "right", 100, ["102", "202", "301"], 2), athlete("E", "right", 150, ["102", "202", "301"]),
  athlete("F", "right", 200, ["202", "301"]),
] });
export { athlete };
