import { useEffect, useRef, useState } from "react";
import { renderPdfPagePreview } from "../../../src/pdf-reader.ts";

const ZOOMS = [{ label: "Ajuster", value: 1 }, { label: "150 %", value: 1.5 }, { label: "200 %", value: 2 }, { label: "300 %", value: 3 }];

/** Page source du PDF, rendue localement : le fichier ne quitte jamais le navigateur. */
export function PdfPreview({ file, pages }: { file: File; pages: number[] }) {
  const [page, setPage] = useState(pages[0] ?? 1);
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const holder = useRef<HTMLDivElement>(null);
  const pagesKey = pages.join(",");

  useEffect(() => setPage(pages[0] ?? 1), [pagesKey]);

  useEffect(() => {
    // Une toile neuve par rendu : PDF.js refuse deux rendus simultanés sur la même toile.
    const canvas = document.createElement("canvas");
    const controller = new AbortController();
    setStatus("loading");
    renderPdfPagePreview(file, page, canvas, controller.signal)
      .then(() => {
        if (controller.signal.aborted) return;
        holder.current?.replaceChildren(canvas);
        setStatus("ready");
      })
      .catch(() => { if (!controller.signal.aborted) setStatus("error"); });
    return () => controller.abort();
  }, [file, page]);

  return (
    <section className="pdf-pane" aria-label="PDF source">
      <div className="pane-bar">
        <div className="segmented" role="tablist" aria-label="Pages de la division">
          {pages.map((p) => (
            <button key={p} role="tab" aria-selected={p === page} className={p === page ? "is-active" : ""} onClick={() => setPage(p)}>
              Page {p}
            </button>
          ))}
        </div>
        <div className="segmented" aria-label="Zoom">
          {ZOOMS.map((z) => (
            <button key={z.value} className={z.value === zoom ? "is-active" : ""} onClick={() => setZoom(z.value)}>{z.label}</button>
          ))}
        </div>
      </div>
      <div className="pdf-scroll">
        {status === "loading" && <p className="muted pad">Affichage de la page {page}…</p>}
        {status === "error" && <p className="error pad">La page {page} n'a pas pu être affichée.</p>}
        <div ref={holder} className="pdf-canvas" style={{ width: `${zoom * 100}%` }} />
      </div>
    </section>
  );
}
