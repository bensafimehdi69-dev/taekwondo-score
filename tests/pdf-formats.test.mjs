import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readPdfFile } from "../src/pdf-reader.ts";
import { buildDrawIndex, searchDrawIndex } from "../src/team-path-parser.ts";
import { verifyDrawImport } from "../src/import-verification.ts";

// Real PDFs are private user fixtures: never commit them. Set this directory in CI.
const locations = process.env.TKD_PDF_FIXTURES_DIRS ? JSON.parse(process.env.TKD_PDF_FIXTURES_DIRS)
  : [process.env.TKD_PDF_FIXTURES_DIR || "fixtures"];
const taiyuanSamples = [
  ["ALSAMIH Fahad", "201 214 221 227 232"], ["HAMDI Riad", "202 215 222 227 232"],
  ["JENDOUBI", "213 221 227 232"], ["ABUTALEB", "112 120 124 226 231"],
  ["TOUMI", "303 314 321 229 233"],
];
const fixtures = [
  { file: "GO-2026_Draws_Cadets_Juniors.pdf",
    counts: [12, 15, 17, 14, 12, 14, 9, 5, 5, 7, 4, 6, 14, 14, 16, 12, 14, 15, 6, 9, 12, 12, 16, 24, 21, 18, 15, 15, 9, 7, 7, 5, 10, 15, 16, 17, 22, 14, 8, 11],
    ages: [...Array(20).fill("Cadet"), ...Array(20).fill("Junior")], teams: [["GER", 203]],
    samples: [["ALQALLAF", "101 124 144 154"], ["ROTHER Daniel", "101 124 144 154"]] },
  { file: "e6c5dbb7-c657-4afb-935b-3bbc57d00022.pdf", counts: [29, 31, 30], age: "Senior", teams: [["KSA", 1]],
    samples: [["SABER", "306 118 224 229 234"]] },
  { file: "Drawsheets Day 2 06.09.2026.pdf", counts: [25, 23, 16, 7, 10, 15, 5, 7], age: "Senior", reviewPages: [1, 5],
    teams: [["KAZ", 108], ["Astana", 7]],
    samples: [["Anuar Mukhamet", "301 319 329 334"], ["Kaziz", "108 116 125 131 134"]] },
  { file: "[DRAW] DAY 1 - Taiyuan 2023 World Taekwondo Grand Prix.pdf", counts: [30, 26, 28], age: "Senior",
    teams: [["KSA", 3], ["TUN", 2], ["KOR", 7]], samples: taiyuanSamples },
  { file: "result day 1 - Competition Draw Sheet with results - 10 OCT 2023.pdf", counts: [30, 26, 28], age: "Senior",
    teams: [["KSA", 3], ["TUN", 2], ["KOR", 7]], samples: taiyuanSamples },
  { file: "Drawsheets Saturday Day 2.pdf", counts: [12, 13, 15, 26, 16, 11, 9, 8, 9, 7, 7, 10, 8, 10, 9, 11, 9, 2, 3], age: "Junior",
    teams: [["KSA", 12], ["Team Saudi", 11]],
    samples: [["Bandar", "102 116 129 136"], ["BAMASUD", "119 131 137"],
      ["ABDULELAH", "201 209 223 330 335"], ["ALBISHI", "409 414 428 331 335"], ["ALKHALDI", "402 420 431 436"]] },
  { file: "899-draw-spanish-open-pdf.pdf", total: 430, pageCount: 16, age: "Senior", teams: [["KOR", 0]],
    samples: [["ALKHAIBARI", "823 843 854 860"], ["ALBISHI", "717 734 747 754 757"],
      ["HAMEDI", "720 735 748 754 757"], ["ABUTALEB", "104 123 139 147 151"],
      ["SITTEK", "714 732 746 753 757"], ["JORGENSEN Otto", "722 736 748 754 757"],
      ["BENETTI Ines", "111 126 140 147 151"], ["PEREZ Alma", "119 130 142 148 151"]] },
  { file: "temp_1784421187079.-10115464.pdf", counts: [18, 14, 17, 31, 32, 16, 17, 16, 5, 7, 11, 13, 14, 17, 15, 14, 14, 9, 4, 2], age: "Junior", teams: [], reviewPages: [16],
    samples: [["FAHAD ALFRSHAN", "431 464 380 488"]] },
];

for (const fixture of fixtures) {
  const path = locations.map((directory) => join(directory, fixture.file)).find(existsSync);
  test(`real PDF: ${fixture.file}`, { skip: !path && process.env.TKD_REQUIRE_PDF_FIXTURES !== "1" ? "Private PDF fixture unavailable; set TKD_PDF_FIXTURES_DIR" : false }, async () => {
    assert.ok(path, "Required private PDF fixture is missing: " + fixture.file);
    const pages = await readPdfFile(new File([readFileSync(path)], fixture.file, { type: "application/pdf" }));
    const index = buildDrawIndex(pages);
    assert.equal(pages.length, fixture.pageCount ?? fixture.counts.length);
    if (fixture.counts) assert.deepEqual(pages.map((page) => index.athletes.filter((athlete) => athlete.page === page.pageNumber).length), fixture.counts);
    if (fixture.total) assert.equal(index.athletes.length, fixture.total);
    if (fixture.age) assert.ok(index.athletes.every((athlete) => athlete.ageCategory === fixture.age), "age categories");
    if (fixture.ages) assert.deepEqual(pages.map((page) => [...new Set(index.athletes.filter((athlete) => athlete.page === page.pageNumber).map((athlete) => athlete.ageCategory))]), fixture.ages.map((age) => [age]));
    assert.ok(index.athletes.every((athlete) => athlete.weightCategory !== "To confirm"), "weight categories");
    assert.ok(index.athletes.every((athlete) => athlete.path.length > 0), "no empty paths");
    assert.ok(index.athletes.every((athlete) => !/\b(?:PTF|DSQ|TEAM|CLUB)\b/i.test(athlete.name)), "no scores or clubs as names");
    for (const [query, expected] of fixture.teams) assert.equal(searchDrawIndex(index, query, "team").athletes.length, expected, query);
    for (const [query, expectedPath] of fixture.samples) {
      const found = searchDrawIndex(index, query, "name").athletes;
      assert.equal(found.length, 1, `unique ${query}`);
      assert.equal(found[0].path.join(" "), expectedPath, query);
    }
    assert.equal(new Set(index.athletes.map((athlete) => athlete.id)).size, index.athletes.length);
    assert.strictEqual(buildDrawIndex(pages), index, "reuse the parsed index between searches");
    const verification = verifyDrawImport(pages, index);
    assert.equal(verification.status, fixture.reviewPages?.length ? "review" : "recognised");
    assert.deepEqual(verification.pages.filter((page) => page.status !== "recognised").map((page) => page.page), fixture.reviewPages ?? []);
    for (const scale of [.5, 2]) {
      const transformed = pages.map((page) => ({ ...page, width: page.width * scale, height: page.height * scale,
        items: page.items.map((item) => ({ ...item, x: item.x * scale, y: item.y * scale, width: item.width * scale, height: item.height * scale })) }));
      const transformedIndex = buildDrawIndex(transformed);
      assert.deepEqual(transformedIndex.athletes.map((athlete) => [athlete.name, athlete.country, athlete.path]), index.athletes.map((athlete) => [athlete.name, athlete.country, athlete.path]));
      assert.equal(verifyDrawImport(transformed, transformedIndex).status, verification.status);
    }
  });
}
