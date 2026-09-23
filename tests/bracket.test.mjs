import test from "node:test";
import assert from "node:assert/strict";
import { analyzeTeamDraw, bracketRoundLabel, chronologicalFightSort, decodeFightCode } from "../src/team-path-parser.ts";
const item = (text, x, y, width = 120, height = 12) => ({ text, x, y, width, height });

test("décode l’aire et le passage d’un numéro de combat", () => {
  assert.deepEqual(decodeFightCode("312"), { area: 3, order: 12 });
  assert.equal(decodeFightCode("12"), null);
});

test("classe les combats par passage puis par aire", () => {
  const values = [decodeFightCode("312"), decodeFightCode("105"), decodeFightCode("212")].filter(Boolean);
  values.sort(chronologicalFightSort);
  assert.deepEqual(values, [{ area: 1, order: 5 }, { area: 2, order: 12 }, { area: 3, order: 12 }]);
});

test("nomme les tours en remontant depuis la finale", () => {
  assert.deepEqual(
    Array.from({ length: 6 }, (_, index) => bracketRoundLabel(6, index)),
    ["Round of 64", "Round of 32", "Round of 16", "Quarter-final", "Semi-final", "Final"],
  );
  assert.equal(bracketRoundLabel(1, 0), "Final");
});

test("retrouve un combattant de l’équipe et son parcours visuel", () => {
  const items = [
    item("Alice Martin Dojo Horizon", 45, 100, 190),
    item("112", 275, 101, 24),
    item("224", 385, 176, 24),
    item("336", 475, 256, 24),
  ];
  const analysis = analyzeTeamDraw([{
    pageNumber: 1, width: 1000, height: 700, orderedText: items.map((entry) => entry.text),
    items, lines: items, rawText: "SENIOR M -68 KG\nAlice Martin Dojo Horizon\n112 224 336",
    customWtFont: false, extractionMethod: "native", extractionConfidence: 0.95,
  }], "Dojo Horizon");
  assert.equal(analysis.athletes.length, 1);
  assert.equal(analysis.athletes[0].name, "Alice Martin");
  assert.equal(analysis.athletes[0].ageCategory, "Senior");
  assert.equal(analysis.athletes[0].weightCategory, "-68 kg");
  assert.equal(analysis.athletes[0].startFight, "112");
  assert.deepEqual(analysis.athletes[0].path, ["112", "224", "336"]);
});

test("lit le nom au-dessus du club dans un tirage TaekoPlan", () => {
  const items = [
    item("B/193", 28, 138, 19, 7),
    item("BAMASUD Meshari", 68, 138, 62, 7),
    item("Team Saudi (2026) KSA", 30, 148, 67, 6),
    item("119", 320, 181, 20, 8),
    item("131", 410, 252, 20, 8),
    item("137", 450, 252, 20, 8),
  ];
  const analysis = analyzeTeamDraw([{
    pageNumber: 2, width: 874, height: 842, orderedText: items.map((entry) => entry.text),
    items, lines: items, rawText: "Juniors Male-A -48 Contestants: 13 Team Saudi (2026) KSA",
    customWtFont: false, extractionMethod: "native", extractionConfidence: 0.98,
  }], "Team Saudi");
  assert.equal(analysis.athletes.length, 1);
  assert.equal(analysis.athletes[0].name, "BAMASUD Meshari");
  assert.equal(analysis.athletes[0].ageCategory, "Junior");
  assert.equal(analysis.athletes[0].genderCategory, "Men");
  assert.equal(analysis.athletes[0].weightCategory, "-48 kg");
  assert.equal(analysis.athletes[0].startFight, "119");
});

test("nettoie un dossard fusionné au nom dans un tirage TaekoPlan", () => {
  const items = [
    item("B/193 BAMASUD Meshari", 28, 138, 102, 7),
    item("Team Saudi (2026) KSA", 30, 148, 67, 6),
    item("119", 320, 181, 20, 8),
    item("131", 410, 252, 20, 8),
    item("137", 450, 252, 20, 8),
  ];
  const analysis = analyzeTeamDraw([{
    pageNumber: 2, width: 874, height: 842, orderedText: items.map((entry) => entry.text),
    items, lines: items, rawText: "Juniors Male-A -48 Contestants: 13 Team Saudi (2026) KSA",
    customWtFont: false, extractionMethod: "native", extractionConfidence: 0.98,
  }], "Team Saudi");
  assert.equal(analysis.athletes.length, 1);
  assert.equal(analysis.athletes[0].name, "BAMASUD Meshari");
  assert.deepEqual(analysis.athletes[0].path, ["119", "131", "137"]);
});

test("ne présente pas le pays ou le club comme nom d’athlète", () => {
  const items = [
    item("Team Saudi (2026) KSA", 30, 148, 90, 7),
    item("119", 320, 181, 20, 8),
  ];
  const analysis = analyzeTeamDraw([{
    pageNumber: 2, width: 874, height: 842, orderedText: items.map((entry) => entry.text),
    items, lines: items, rawText: "Juniors Male-A -48 Contestants: 13 Team Saudi (2026) KSA",
    customWtFont: false, extractionMethod: "native", extractionConfidence: 0.98,
  }], "Team Saudi");
  assert.equal(analysis.athletes.length, 0);
});

test("n’attribue pas un combat préliminaire appartenant à une autre paire", () => {
  const athletes = [
    item("LEE KOR", 48, 116, 70, 6),
    item("TAM HKG", 48, 161, 70, 6),
    item("MAULEN KAZ", 48, 206, 70, 6),
    item("BERKINBAY KAZ", 48, 251, 85, 6),
    item("TANAEV RUS", 48, 296, 70, 6),
    item("BURGERS AUS", 48, 319, 70, 6),
    item("FAHAD ALFRSHAN KSA", 48, 341, 100, 6),
    item("KIM KOR", 48, 386, 70, 6),
    item("CHENG HKG", 48, 431, 70, 6),
  ];
  const fights = [
    item("501", 172, 166, 8, 5),
    item("526", 228, 144, 8, 5), item("430", 228, 234, 8, 5),
    item("431", 228, 324, 8, 5), item("434", 228, 414, 8, 5),
    item("462", 284, 189, 8, 5), item("464", 284, 369, 8, 5),
    item("380", 340, 279, 8, 5), item("488", 418, 279, 8, 5),
  ];
  const items = [...athletes, ...fights];
  const analysis = analyzeTeamDraw([{
    pageNumber: 1, width: 842, height: 595, orderedText: items.map((entry) => entry.text),
    items, lines: items, rawText: "Men -45kg Contestants : 18", customWtFont: false,
    extractionMethod: "native", extractionConfidence: 0.98,
  }], "KSA");
  assert.equal(analysis.athletes[0].name, "FAHAD ALFRSHAN");
  assert.equal(analysis.athletes[0].weightCategory, "-45 kg");
  assert.equal(analysis.athletes[0].ageCategory, "To confirm");
  assert.deepEqual(analysis.athletes[0].path, ["431", "464", "380", "488"]);
});

test("déduit une catégorie junior depuis la série de poids du tirage", () => {
  const weights = ["-45", "-48", "-51", "-55"];
  const pages = weights.map((weight, index) => {
    const items = [item(`ATHLETE ${index} KSA`, 48, 116, 100, 6), item(`${index + 1}12`, 228, 144, 8, 5)];
    return {
      pageNumber: index + 1, width: 842, height: 595, orderedText: items.map((entry) => entry.text), items, lines: items,
      rawText: `Men ${weight}kg Contestants`, customWtFont: false, extractionMethod: "native", extractionConfidence: 0.98,
    };
  });
  const analysis = analyzeTeamDraw(pages, "KSA");
  assert.equal(analysis.athletes[0].ageCategory, "Junior");
  assert.equal(analysis.athletes[0].genderCategory, "Men");
  assert.equal(analysis.athletes[0].weightCategory, "-45 kg");
});

test("respecte un exempt au premier tour", () => {
  const athletes = [
    item("NAWAF ALBISHI KSA", 48, 116, 90, 6),
    item("YUN KOR", 48, 161, 70, 6),
    item("SEO KOR", 48, 206, 70, 6),
    item("KIM KOR", 48, 251, 70, 6),
  ];
  const fights = [
    item("402", 172, 166, 8, 5), item("403", 172, 211, 8, 5),
    item("442", 228, 144, 8, 5), item("566", 284, 189, 8, 5),
    item("381", 340, 279, 8, 5), item("588", 418, 279, 8, 5),
  ];
  const items = [...athletes, ...fights];
  const analysis = analyzeTeamDraw([{
    pageNumber: 4, width: 842, height: 595, orderedText: items.map((entry) => entry.text),
    items, lines: items, rawText: "Men -55kg Contestants : 31", customWtFont: false,
    extractionMethod: "native", extractionConfidence: 0.98,
  }], "KSA");
  assert.deepEqual(analysis.athletes[0].path, ["442", "566", "381", "588"]);
});

test("ne confond pas un code équipe avec une partie du nom", () => {
  const items = [
    item("TEMIRLAN MAKSATULY KAZ", 710, 296, 85, 6),
    item("ABDULAZIZ ALKHALDI KSA", 710, 341, 85, 6),
    item("439", 607, 324, 8, 5), item("465", 551, 369, 8, 5),
    item("579", 495, 279, 8, 5), item("587", 418, 279, 8, 5),
  ];
  const analysis = analyzeTeamDraw([{
    pageNumber: 3, width: 842, height: 595, orderedText: items.map((entry) => entry.text),
    items, lines: items, rawText: "Men -51kg Contestants : 17", customWtFont: false,
    extractionMethod: "native", extractionConfidence: 0.98,
  }], "KSA");
  assert.deepEqual(analysis.athletes.map((athlete) => athlete.name), ["ABDULAZIZ ALKHALDI"]);
});
