// Résumé des arbres reconstruits d'un PDF : une ligne par division, puis les anomalies.
// Usage : npm run brackets -- "/chemin/tirage.pdf"
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { readDraw } from "../src/read-draw.ts";

const [path] = process.argv.slice(2);
if (!path) {
  console.error('Usage: npm run brackets -- "/chemin/tirage.pdf"');
  process.exitCode = 1;
} else {
  const originalLog = console.log;
  console.log = (...args) => console.error(...args);
  try {
    const file = new File([await readFile(path)], basename(path), { type: "application/pdf" });
    const { brackets } = await readDraw(file);
    for (const d of brackets) {
      const seeds = d.entrants.filter((e) => e.seed !== undefined).length;
      process.stdout.write(`${d.status === "ok" ? "OK    " : "REVIEW"}  p.${d.pages.join(",")}  ${d.category}  ${d.size} athlètes, ${seeds} têtes de série, ${d.quarterFights.length} quarts\n`);
      for (const issue of d.issues) process.stdout.write(`          - ${issue}\n`);
    }
    const ok = brackets.filter((d) => d.status === "ok").length;
    process.stdout.write(`\n${ok}/${brackets.length} divisions sans anomalie.\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    console.log = originalLog;
  }
}
