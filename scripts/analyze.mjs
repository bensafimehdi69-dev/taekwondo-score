import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { readDraw } from "../src/read-draw.ts";

const [path, query = "", mode = "all"] = process.argv.slice(2);
if (!path || !["all", "name", "team"].includes(mode)) {
  console.error('Usage: npm run analyze -- "/path/draw.pdf" "search text" name|team|all');
  process.exitCode = 1;
} else {
  // PDF.js diagnostics are separate from the JSON on stdout.
  const originalLog = console.log;
  console.log = (...args) => console.error(...args);
  try {
    const file = new File([await readFile(path)], basename(path), { type: "application/pdf" });
    const { verification, results } = await readDraw(file, query, mode);
    process.stdout.write(JSON.stringify({ verification, results }, null, 2) + "\n");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    console.log = originalLog;
  }
}
