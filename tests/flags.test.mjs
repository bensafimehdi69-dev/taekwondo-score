import test from "node:test";
import assert from "node:assert/strict";
import { flagOf } from "../src/flags.ts";

test("drapeaux : codes CIO des feuilles, variantes ISO, et rien pour les équipes sans pays", () => {
  assert.deepEqual(["FRA", "KOR", "IRI", "GER", "GRE", "TPE", "KSA", "SUI", "DEU"].map(flagOf),
    ["🇫🇷", "🇰🇷", "🇮🇷", "🇩🇪", "🇬🇷", "🇹🇼", "🇸🇦", "🇨🇭", "🇩🇪"]);
  assert.deepEqual(["WT", "AIN", "XXX", "", undefined].map(flagOf), ["", "", "", "", ""]);
});
