import { mkdir, copyFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);
const legacyRoot = dirname(require.resolve("pdfjs-ios/package.json"));
const modernRoot = dirname(require.resolve("pdfjs-dist/package.json"));
const target = new URL("../public/vendor/pdfjs-ios/", import.meta.url);
await mkdir(target, { recursive: true });
const assets = [
  ["legacy/build/pdf.min.js", "pdf.min.js", "978fd1b2d134a98e98966186a97777bebf87d8e770dadab1ece3687e21a5aa6c"],
  ["legacy/build/pdf.worker.min.js", "pdf.worker.min.js", "38cde5311957b86bc3669f93e7d2566de333a90055ed6635bef60d9bf00e96f2"],
  ["LICENSE", "LICENSE", "0d542e0c8804e39aa7f37eb00da5a762149dc682d7829451287e11b938e94594"],
];
for (const [source, name, expected] of assets) {
  const bytes = await readFile(join(legacyRoot, source));
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected) throw new Error("Unexpected legacy asset: " + name + ". Check version/build before using it.");
  await copyFile(join(legacyRoot, source), new URL(name, target));
}
// Optional static worker boundary for bundlers that cannot emit the new URL(...).
const modernTarget = new URL("../public/vendor/pdfjs-modern/", import.meta.url);
await mkdir(modernTarget, { recursive: true });
await copyFile(join(modernRoot, "legacy/build/pdf.worker.min.mjs"), new URL("pdf.worker.min.mjs", modernTarget));
await copyFile(join(modernRoot, "LICENSE"), new URL("LICENSE", modernTarget));
console.log("PDF workers and iOS assets are ready. Serve public/ at the site root.");
