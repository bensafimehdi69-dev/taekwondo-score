import type { ParsedPage, VisualTextItem } from "./types.ts";

// Woori/WT PDFs shuffle character codes between files. The Type3 outlines stay
// stable, so their normalized fingerprints provide the reliable alphabet.
const WT_GLYPH_MAP: Record<string, string> = {
  "10clw0q": "B",
  "10xcwqy": "E",
  "1109ixr": "0",
  "117xnfh": "k",
  "1241skl": "1",
  "12pxjn9": "I",
  "130iocc": "r",
  "139vmkp": "K",
  "13d3fbv": "F",
  "14a4fls": "m",
  "14vslv7": ":",
  "15qawfl": "c",
  "168jfiw": "3",
  "16gsm4d": "i",
  "17ptqcj": "M",
  "181iyd9": "A",
  "18m7mgq": "7",
  "19q5zuv": "j",
  "19usdj5": "U",
  "1b0fjjd": "F",
  "1cn2rv1": "'",
  "1czuypw": "W",
  "1daq0bp": "o",
  "1dp5any": "4",
  "1dr810w": "v",
  "1duxgwg": "P",
  "1dz559d": "8",
  "1gj7gv2": "T",
  "1hmblnu": "2",
  "1i8hevi": "D",
  "1izvn1l": "U",
  "1jqqtfr": "G",
  "1kphun9": "Q",
  "1l3sm0n": "k",
  "1l92zcm": "s",
  "1ln2e4r": "e",
  "1lph70k": "M",
  "1mqycc9": "S",
  "1mygz5": "l",
  "1myl9ed": "X",
  "1nf3iha": ":",
  "1ni7fid": "-",
  "1nl2bru": "I",
  "1ot91e2": "G",
  "1ou46hk": "4",
  "1oyg6ck": "o",
  "1p8laq0": "e",
  "1p95foy": "n",
  "1pdn9r8": "7",
  "1pv53pa": "w",
  "1reto56": "8",
  "1rxqavp": "N",
  "1sal6ck": "P",
  "1tgtz3f": "a",
  "1u4s4a0": "5",
  "1uak0uk": "3",
  "1ubucry": "y",
  "1uqdsuj": "+",
  "1vemnv9": "5",
  "1vhqvv5": "O",
  "1vod5lx": "q",
  "1vzie5a": "S",
  "1waxdhz": "J",
  "1wksr9o": "d",
  "1yuqvfc": "-",
  "207rkt": "W",
  "2ccmrs": "m",
  "3po17z": "A",
  "4vsdr6": "n",
  "5m8lq6": "f",
  "5q6erx": "9",
  "64bm8a": "L",
  "6gskez": "6",
  "6jd8v5": "h",
  "8ih9s5": "r",
  "9s1hol": " ",
  "9xmiv2": ")",
  "a3n51q": "w",
  "aekoc6": "z",
  "c2xqvq": "Y",
  "cmy8iz": "g",
  "d8j5uy": "9",
  "dtlfev": "R",
  "ernor8": "6",
  "fzg3ow": "I",
  "fzvf4o": "J",
  "h80l2w": ".",
  "hculp2": "(",
  "idhmo0": "9",
  "jib8f7": "Z",
  "l39lhw": "x",
  "lyow77": "H",
  "mnfox8": "t",
  "nuq5v4": "i",
  "nxeen9": "T",
  "p6ffot": "t",
  "pry5tw": "N",
  "sk007h": "C",
  "smlxng": "b",
  "t1p0ju": "g",
  "tqsxsb": "x",
  "uu9pr7": "R",
  "uuc31q": "V",
  "vg8gwf": "d",
  "vtl90v": "2",
  "wbx55g": "0",
  "wsebev": "p",
  "ym5jea": "C",
  "yo99zt": "s",
  "ysgi76": "1",
  "yu900s": "u",
  "z0n6kh": "a"
};

function normalizeWtProc(value: unknown): unknown {
  if (typeof value === "number") return Number(value.toFixed(3));
  if (Array.isArray(value)) return value.map(normalizeWtProc);
  if (value && typeof value === "object") {
    const normalized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) normalized[key] = normalizeWtProc(entry);
    return normalized;
  }
  return value;
}

function wtProcFingerprint(value: unknown): string {
  const source = JSON.stringify(normalizeWtProc(value));
  let result = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    result ^= source.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

type PdfPage = {
  rotate: number;
  commonObjs: { get: (id: string) => unknown };
  getViewport: (options: { scale: number }) => {
    width: number;
    height: number;
    convertToViewportPoint: (x: number, y: number) => [number, number];
  };
  getTextContent: (options?: Record<string, unknown>) => Promise<{ items: PdfTextItem[] }>;
  getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[] }>;
  render: (options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: ReturnType<PdfPage["getViewport"]>;
  }) => { promise: Promise<void> };
};

type PdfTextItem = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
};

type PdfGlyph = {
  originalCharCode?: number;
  operatorListId?: string | number;
  unicode?: string;
};

function glyphsFrom(value: unknown): PdfGlyph[] {
  if (!Array.isArray(value)) return [];
  const glyphs: PdfGlyph[] = [];
  const visit = (entry: unknown) => {
    if (Array.isArray(entry)) {
      for (const nested of entry) visit(nested);
      return;
    }
    if (entry && typeof entry === "object" && ("operatorListId" in entry || "unicode" in entry)) {
      glyphs.push(entry as PdfGlyph);
    }
  };
  visit(value);
  return glyphs;
}

function mergeLines(items: VisualTextItem[], concatenate = false): VisualTextItem[] {
  const rows: VisualTextItem[][] = [];
  for (const item of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    let row = rows.find((candidate) => Math.abs(candidate[0].y - item.y) <= 1.25);
    if (!row) {
      row = [];
      rows.push(row);
    }
    row.push(item);
  }

  const fragments: VisualTextItem[] = [];
  for (const row of rows) {
    const ordered = row.sort((a, b) => a.x - b.x);
    let current: VisualTextItem | null = null;
    for (const item of ordered) {
      const gap = current ? item.x - (current.x + current.width) : 0;
      if (!current || gap > (concatenate ? 20 : 14)) {
        if (current) fragments.push(current);
        current = { ...item, text: item.text };
      } else {
        const separator = concatenate || /\s$/.test(current.text) || /^\s/.test(item.text) ? "" : " ";
        const end = Math.max(current.x + current.width, item.x + item.width);
        current.text += `${separator}${item.text}`;
        current.width = end - current.x;
        current.height = Math.max(current.height, item.height);
      }
    }
    if (current) fragments.push(current);
  }
  return fragments.map((item) => ({ ...item, text: item.text.replace(/\s+/g, " ").trim() })).filter((item) => item.text);
}

function standardPageItems(
  textContent: { items: PdfTextItem[] },
  viewport: ReturnType<PdfPage["getViewport"]>,
): { items: VisualTextItem[]; orderedText: string[] } {
  const items: VisualTextItem[] = [];
  const orderedText: string[] = [];
  for (const item of textContent.items) {
    if (typeof item.str !== "string") continue;
    const text = item.str.replace(/\s+/g, " ").trim();
    if (text) orderedText.push(text);
    if (!text || !Array.isArray(item.transform)) continue;
    const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
    items.push({
      text,
      x,
      y,
      width: Number(item.width) || 0,
      height: Math.abs(Number(item.height)) || Math.abs(Number(item.transform[3])) || 0,
    });
  }
  return { items, orderedText };
}

function multiplyTranslation(
  matrix: number[],
  tx: number,
  ty: number,
): number[] {
  const [a, b, c, d, e, f] = matrix;
  return [a, b, c, d, e + tx * a + ty * c, f + tx * b + ty * d];
}

export async function wtPageItems(
  page: PdfPage,
  viewport: ReturnType<PdfPage["getViewport"]>,
  OPS: Record<string, number>,
  reference?: Map<string, string>,
): Promise<{ items: VisualTextItem[]; reference: Map<string, string> }> {
  const operatorList = await page.getOperatorList();
  const items: VisualTextItem[] = [];
  let matrix = [1, 0, 0, 1, 0, 0];
  let fontSize = 8;

  const findFontId = (value: unknown): string | undefined => {
    if (typeof value === "string" && /_f\d+$/.test(value)) return value;
    if (Array.isArray(value)) {
      for (const entry of value) {
        const found = findFontId(entry);
        if (found) return found;
      }
    }
    return undefined;
  };
  // Outline recognition is stable across files; raw character codes are not.
  // Decode each outline once per font, and never overwrite a known character
  // with the historical code table from another document.
  reference = reference ?? new Map(Object.entries(WT_GLYPH_MAP));
  const fonts = new Map<string, { characters: Map<string, string>; type3: boolean }>();
  const loadFont = (id: string) => {
    const cached = fonts.get(id);
    if (cached) return cached;
    const font = page.commonObjs.get(id) as { charProcOperatorList?: Record<string, unknown> } | undefined;
    const procs = font?.charProcOperatorList ?? {};
    const characters = new Map<string, string>();
    for (const [procId, proc] of Object.entries(procs)) {
      const character = reference!.get(wtProcFingerprint(proc));
      if (character !== undefined) characters.set(procId, character);
    }
    const decoded = { characters, type3: Object.keys(procs).length > 0 };
    fonts.set(id, decoded);
    return decoded;
  };
  const initialFont = findFontId(operatorList.argsArray);
  let activeFont = initialFont ? loadFont(initialFont) : { characters: new Map<string, string>(), type3: false };
  const decodeGlyph = (glyph: PdfGlyph): string => activeFont.type3
    ? activeFont.characters.get(String(glyph.operatorListId)) ?? "?"
    : glyph.unicode ?? "?";

  for (let index = 0; index < operatorList.fnArray.length; index += 1) {
    const operation = operatorList.fnArray[index];
    const args = (operatorList.argsArray[index] ?? []) as unknown[];
    if (operation === OPS.setTextMatrix) {
      matrix = Array.from((args[0] ?? args) as ArrayLike<unknown>, (value) => Number(value));
    } else if (operation === OPS.setLeadingMoveText || operation === OPS.moveText) {
      matrix = multiplyTranslation(matrix, Number(args[0]) || 0, Number(args[1]) || 0);
    } else if (operation === OPS.setFont) {
      if (typeof args[0] === "string") activeFont = loadFont(args[0]);
      fontSize = Math.abs(Number(args[1])) || fontSize;
    } else if (operation === OPS.showText || operation === OPS.showSpacedText) {
      const glyphs = glyphsFrom(args[0]);
      const text = glyphs.map(decodeGlyph).join("");
      const [x, y] = viewport.convertToViewportPoint(matrix[4], matrix[5]);
      const visibleLength = Math.max(1, text.length);
      items.push({ text, x, y, width: visibleLength * fontSize * 0.62, height: fontSize });
    }
  }
  return { items, reference };
}

function looksObfuscated(textContent: { items: PdfTextItem[] }): boolean {
  const joined = textContent.items.map((item) => (typeof item.str === "string" ? item.str : "")).join("");
  if (!joined) return false;
  const control = [...joined].filter((char) => char.charCodeAt(0) < 32 && !/\s/.test(char)).length;
  return control / joined.length > 0.025;
}

function extractionConfidence(lines: VisualTextItem[], rawText: string): number {
  if (!rawText.trim()) return 0;
  const visible = [...rawText].filter((char) => /[\p{L}\p{N}]/u.test(char)).length;
  const replacement = [...rawText].filter((char) => char === "?" || char === "�").length;
  const visibleRatio = visible / Math.max(1, rawText.length);
  const lengthScore = Math.min(1, visible / 180);
  const lineScore = Math.min(1, lines.length / 12);
  return Math.max(
    0.05,
    Math.min(1, visibleRatio * 0.35 + lengthScore * 0.35 + lineScore * 0.3 - replacement * 0.015),
  );
}

async function pageHasRasterImage(page: PdfPage, OPS: Record<string, number>): Promise<boolean> {
  const operatorList = await page.getOperatorList();
  const imageOperations = new Set(
    [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintJpegXObject].filter(
      (value): value is number => typeof value === "number",
    ),
  );
  return operatorList.fnArray.some((operation) => imageOperations.has(operation));
}

type OcrWorker = {
  recognize: (
    image: HTMLCanvasElement,
    options?: Record<string, unknown>,
    output?: Record<string, boolean>,
  ) => Promise<{
    data: {
      text: string;
      confidence: number;
      blocks: Array<{
        paragraphs: Array<{
          lines: Array<{
            text: string;
            confidence: number;
            bbox: { x0: number; y0: number; x1: number; y1: number };
          }>;
        }>;
      }> | null;
    };
  }>;
  setParameters: (parameters: Record<string, string>) => Promise<unknown>;
  terminate: () => Promise<unknown>;
};

async function createOcrWorker(): Promise<OcrWorker> {
  const tesseract = await import("tesseract.js");
  const worker = await tesseract.createWorker("eng");
  await worker.setParameters({
    tessedit_pageseg_mode: tesseract.PSM.SPARSE_TEXT,
    preserve_interword_spaces: "1",
  });
  return worker as unknown as OcrWorker;
}

async function ocrPageItems(
  page: PdfPage,
  worker: OcrWorker,
): Promise<{
  items: VisualTextItem[];
  orderedText: string[];
  confidence: number;
}> {
  if (typeof window === "undefined" || typeof window.document === "undefined") {
    throw new Error("Visual OCR is only available in the browser");
  }
  const scale = 2;
  const viewport = page.getViewport({ scale });
  const canvas = window.document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("OCR canvas is unavailable");
  let recognized: Awaited<ReturnType<OcrWorker["recognize"]>>;
  try {
    await page.render({ canvasContext: context, viewport }).promise;
    recognized = await worker.recognize(canvas, {}, { text: true, blocks: true });
  } finally {
    // Release the full-resolution bitmap between pages, especially on iPhones.
    canvas.width = 0;
    canvas.height = 0;
  }
  const items: VisualTextItem[] = [];
  for (const block of recognized.data.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        const text = line.text.replace(/\s+/g, " ").trim();
        if (!text) continue;
        items.push({
          text,
          x: line.bbox.x0 / scale,
          y: line.bbox.y0 / scale,
          width: (line.bbox.x1 - line.bbox.x0) / scale,
          height: (line.bbox.y1 - line.bbox.y0) / scale,
        });
      }
    }
  }
  const orderedText = items
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((item) => item.text);
  return {
    items,
    orderedText,
    confidence: Math.max(0, Math.min(1, recognized.data.confidence / 100)),
  };
}

async function readFileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === "function") {
    return new Uint8Array(await file.arrayBuffer());
  }
  if (typeof FileReader === "undefined") {
    throw new Error("This browser cannot read local PDF files.");
  }
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("The selected PDF could not be read."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("The selected PDF could not be read."));
    reader.readAsArrayBuffer(file);
  });
  return new Uint8Array(buffer);
}

function needsInlinePdfWorker() {
  if (typeof navigator === "undefined") return false;
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("pdfWorker") === "inline") return true;
  const userAgent = navigator.userAgent || "";
  const isiPadDesktopMode = /Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/i.test(userAgent)
    || isiPadDesktopMode
    || /FBAN|FBAV|Instagram|WhatsApp/i.test(userAgent);
}

function installPdfCompatibility() {
  const promiseConstructor = Promise as PromiseConstructor & {
    withResolvers?: <T>() => {
      promise: Promise<T>;
      resolve: (value: T | PromiseLike<T>) => void;
      reject: (reason?: unknown) => void;
    };
  };
  if (typeof promiseConstructor.withResolvers !== "function") {
    promiseConstructor.withResolvers = <T>() => {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
      });
      return { promise, resolve, reject };
    };
  }

  const urlConstructor = URL as typeof URL & { parse?: (url: string, base?: string | URL) => URL | null };
  if (typeof urlConstructor.parse !== "function") {
    urlConstructor.parse = (url, base) => {
      try { return new URL(url, base); }
      catch { return null; }
    };
  }

  const arrayPrototype = Array.prototype as unknown as {
    findLast?: <T>(this: T[], predicate: (value: T, index: number, array: T[]) => unknown) => T | undefined;
    findLastIndex?: <T>(this: T[], predicate: (value: T, index: number, array: T[]) => unknown) => number;
  };
  if (typeof arrayPrototype.findLast !== "function") {
    arrayPrototype.findLast = function <T>(this: T[], predicate: (value: T, index: number, array: T[]) => unknown) {
      for (let index = this.length - 1; index >= 0; index -= 1) if (predicate(this[index], index, this)) return this[index];
      return undefined;
    };
  }
  if (typeof arrayPrototype.findLastIndex !== "function") {
    arrayPrototype.findLastIndex = function <T>(this: T[], predicate: (value: T, index: number, array: T[]) => unknown) {
      for (let index = this.length - 1; index >= 0; index -= 1) if (predicate(this[index], index, this)) return index;
      return -1;
    };
  }
}

async function enableInlinePdfWorker() {
  // Some iPhone webviews expose Worker but cannot execute PDF.js' module
  // worker. Loading its exact same handler in the page avoids that broken
  // browser boundary without changing the extraction engine.
  const worker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  (globalThis as typeof globalThis & { pdfjsWorker?: { WorkerMessageHandler: unknown } }).pdfjsWorker = {
    WorkerMessageHandler: worker.WorkerMessageHandler,
  };
}

type PdfJsApi = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let iosPdfJsPromise: Promise<PdfJsApi> | null = null;

function loadBrowserScript(source: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-pdfjs-source="${source}"]`);
    if (existing?.dataset.loaded === "true") { resolve(); return; }
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => { script.dataset.loaded = "true"; resolve(); }, { once: true });
    script.addEventListener("error", () => {
      script.remove();
      reject(new Error(`The compatible PDF component could not be loaded: ${source}`));
    }, { once: true });
    if (!existing) {
      script.src = source;
      script.async = true;
      script.dataset.pdfjsSource = source;
      window.document.head.appendChild(script);
    }
  });
}

async function loadIosPdfJs(): Promise<PdfJsApi> {
  if (typeof document === "undefined") throw new Error("The iPhone PDF reader requires a browser.");
  iosPdfJsPromise ??= (async () => {
    await loadBrowserScript("/vendor/pdfjs-ios/pdf.min.js");
    await loadBrowserScript("/vendor/pdfjs-ios/pdf.worker.min.js");
    const pdfjs = (globalThis as typeof globalThis & { pdfjsLib?: PdfJsApi }).pdfjsLib;
    if (!pdfjs?.getDocument || !(globalThis as typeof globalThis & { pdfjsWorker?: unknown }).pdfjsWorker) {
      throw new Error("The iPhone-compatible PDF reader could not be started.");
    }
    return pdfjs;
  })().catch((error) => {
    iosPdfJsPromise = null;
    throw error;
  });
  return iosPdfJsPromise;
}

function needsIosPdfEngine() {
  if (typeof navigator === "undefined") return false;
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("pdfEngine") === "ios") return true;
  const userAgent = navigator.userAgent || "";
  const isiPadDesktopMode = /Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/i.test(userAgent)
    || isiPadDesktopMode
    || /FBAN|FBAV|Instagram|WhatsApp/i.test(userAgent);
}

export async function readPdfFile(
  file: File,
  onProgress?: (page: number, total: number) => void,
): Promise<ParsedPage[]> {
  const data = await readFileBytes(file);
  if (needsIosPdfEngine()) {
    try { return await readPdfBytes(data, onProgress, true); }
    catch (iosError) {
      console.warn("iPhone-compatible PDF reader failed; retrying with the modern reader", iosError);
      return readPdfBytes(data, onProgress, false);
    }
  }
  try { return await readPdfBytes(data, onProgress, false); }
  catch (modernError) {
    console.warn("Modern PDF reader failed; retrying with the iPhone-compatible reader", modernError);
    return readPdfBytes(data, onProgress, true);
  }
}

/** Render one source page on demand; no PDF bytes or preview leave the device. */
export async function renderPdfPagePreview(file: File, pageNumber: number, canvas: HTMLCanvasElement, signal: AbortSignal): Promise<void> {
  installPdfCompatibility();
  const iosEngine = needsIosPdfEngine();
  const pdfjs = iosEngine ? await loadIosPdfJs() : await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!iosEngine) {
    if (needsInlinePdfWorker()) await enableInlinePdfWorker();
    else if (typeof window !== "undefined") pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  }
  if (signal.aborted) return;
  const data = await readFileBytes(file);
  if (signal.aborted) return;
  const task = pdfjs.getDocument({ data, useWorkerFetch: false, isOffscreenCanvasSupported: false, isImageDecoderSupported: false });
  const cancel = () => { void task.destroy().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const document = await task.promise;
    if (signal.aborted) return;
    const page = await document.getPage(pageNumber) as unknown as PdfPage;
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 1800 / base.width, Math.sqrt(3_000_000 / (base.width * base.height)));
    const viewport = page.getViewport({ scale });
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The source preview could not be displayed.");
    await page.render({ canvasContext: context, viewport }).promise;
  } finally {
    signal.removeEventListener("abort", cancel);
    await task.destroy().catch(() => undefined);
  }
}

async function readPdfBytes(
  sourceData: Uint8Array,
  onProgress?: (page: number, total: number) => void,
  iosEngine = false,
): Promise<ParsedPage[]> {
  // PDF.js' modern bundle requires very recent Safari APIs such as
  // Promise.withResolvers and URL.parse. The legacy bundle includes the same
  // parser plus the compatibility layer required by older iPhones.
  installPdfCompatibility();
  const pdfjs = iosEngine ? await loadIosPdfJs() : await import("pdfjs-dist/legacy/build/pdf.mjs");
  const inlineWorker = iosEngine || needsInlinePdfWorker();
  if (inlineWorker) {
    if (!iosEngine) await enableInlinePdfWorker();
  } else if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }

  const data = sourceData.slice();
  const retryData = sourceData.slice();
  let pdfDocument: Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;
  try {
    pdfDocument = await pdfjs.getDocument({
      data,
      useWorkerFetch: false,
      isOffscreenCanvasSupported: false,
      isImageDecoderSupported: false,
    }).promise;
  } catch (workerError) {
    if (inlineWorker) throw workerError;
    await enableInlinePdfWorker();
    pdfDocument = await pdfjs.getDocument({
      data: retryData,
      useWorkerFetch: false,
      isOffscreenCanvasSupported: false,
      isImageDecoderSupported: false,
    }).promise;
  }
  const pages: ParsedPage[] = [];
  let wtReference: Map<string, string> | undefined;
  let ocrWorker: OcrWorker | undefined;
  const tryOcr = async (page: PdfPage, parsed: ParsedPage) => {
    try {
      if (typeof window === "undefined") throw new Error("OCR requires a browser");
      ocrWorker ??= await createOcrWorker();
      const ocr = await ocrPageItems(page, ocrWorker);
      const lines = mergeLines(ocr.items);
      const rawText = ocr.orderedText.join("\n");
      const quality = extractionConfidence(lines, rawText) * 0.7 + ocr.confidence * 0.3;
      if (quality > (parsed.extractionConfidence ?? 0)) {
        Object.assign(parsed, { items: ocr.items, orderedText: ocr.orderedText, lines,
          rawText, extractionConfidence: quality, extractionMethod: "ocr" });
        parsed.extractionWarnings?.push("Visual OCR was used. Please review names and fight numbers.");
      } else {
        parsed.extractionWarnings?.push("OCR did not produce more reliable text than the PDF text layer.");
      }
    } catch (cause) {
      console.warn("OCR fallback failed", cause);
      parsed.extractionWarnings?.push("Some text could not be decoded, and visual OCR could not be completed. Please review this page.");
    }
  };

  try {
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    onProgress?.(pageNumber, pdfDocument.numPages);
    const page = (await pdfDocument.getPage(pageNumber)) as unknown as PdfPage;
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent({ disableNormalization: true });
    const customWtFont = looksObfuscated(textContent);

      if (customWtFont) {
      const wt = await wtPageItems(
        page,
        viewport,
        pdfjs.OPS as unknown as Record<string, number>,
        wtReference,
      );
      wtReference = wt.reference;
      const items = wt.items;
      const lines = mergeLines(items, true);
      const combined: VisualTextItem[] = [];
      const consumed = new Set<VisualTextItem>();
      for (const line of lines) {
        if (/^(?:\([A-Z]{3}\)|[A-Z]{3})$/.test(line.text) || /\([A-Z]{3}\)\s*$/.test(line.text) || !/[A-Za-z]/.test(line.text)) continue;
        const countryLine = lines.find(
          (candidate) =>
            /^(?:\([A-Z]{3}\)|[A-Z]{3})$/.test(candidate.text) &&
            !/^[123]\.?\s+/.test(candidate.text) &&
            candidate.y > line.y &&
            candidate.y - line.y < 9 &&
            (
              Math.abs(candidate.x - line.x) < 12 ||
              Math.abs(
                candidate.x + candidate.width - (line.x + line.width),
              ) < 12
            ),
        );
        if (countryLine) {
          combined.push({
            ...line,
            text: `${line.text} ${countryLine.text}`,
            width: Math.max(line.width, countryLine.width),
          });
          consumed.add(line);
          consumed.add(countryLine);
        }
      }
      const enriched = [...lines.filter((line) => !consumed.has(line)), ...combined];
      const parsed: ParsedPage = {
        pageNumber,
        width: viewport.width,
        height: viewport.height,
        orderedText: lines.map((line) => line.text),
        items: enriched,
        lines,
        rawText: lines.map((line) => line.text).join("\n"),
        customWtFont: true,
        extractionMethod: "type3",
        extractionConfidence: extractionConfidence(lines, lines.map((line) => line.text).join("\n")),
        extractionWarnings: [],
      };
      if ((parsed.extractionConfidence ?? 0) < 0.38 || parsed.rawText.includes("?")) {
        parsed.extractionWarnings?.push("Some custom-font characters could not be recognised from their outlines.");
        await tryOcr(page, parsed);
      }
      pages.push(parsed);
      } else {
      const standard = standardPageItems(textContent, viewport);
      const items = standard.items;
      const orderedText = standard.orderedText;
      const lines = mergeLines(items);
      const rawText = orderedText.join(" ");
      const confidence = extractionConfidence(lines, rawText);
      const extractionWarnings: string[] = [];
      const parsed: ParsedPage = {
        pageNumber,
        width: viewport.width,
        height: viewport.height,
        orderedText,
        items,
        lines,
        rawText,
        customWtFont: false,
        extractionMethod: "native",
        extractionConfidence: confidence,
        extractionWarnings,
      };
      if (confidence < 0.38 && await pageHasRasterImage(page, pdfjs.OPS as unknown as Record<string, number>)) await tryOcr(page, parsed);
      pages.push(parsed);
      }
    }
  } finally {
    if (ocrWorker) await ocrWorker.terminate().catch(() => undefined);
    await pdfDocument.destroy().catch(() => undefined);
  }
  return pages;
}
