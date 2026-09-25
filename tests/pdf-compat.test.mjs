import test from "node:test";
import assert from "node:assert/strict";
import { installPdfCompatibility } from "../src/pdf-reader.ts";

test("Safari : ReadableStream parcourable avec « for await » (PDF.js 5, getTextContent)", async () => {
  const prototype = ReadableStream.prototype;
  const original = prototype[Symbol.asyncIterator];
  // Simule Safari, qui n'a pas cet itérateur.
  delete prototype[Symbol.asyncIterator];
  try {
    installPdfCompatibility();
    assert.equal(typeof prototype[Symbol.asyncIterator], "function");
    const stream = new ReadableStream({ start(controller) { controller.enqueue("a"); controller.enqueue("b"); controller.close(); } });
    const values = [];
    for await (const value of stream) values.push(value);
    assert.deepEqual(values, ["a", "b"]);
    assert.equal(stream.locked, false);
  } finally {
    if (original) prototype[Symbol.asyncIterator] = original;
  }
});
