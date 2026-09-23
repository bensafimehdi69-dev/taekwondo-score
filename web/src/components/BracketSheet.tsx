// Feuille de tirage interactive, de la même forme que le PDF officiel : on fait avancer les athlètes
// (quarts, demies, finale, vainqueur) ; chaque case n'accepte que sa branche. Zoom par boutons ou pincement.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { advance, clearSlot, type BracketTree, type TreeState } from "../../../src/bracket-tree.ts";
import { layoutSheet, SHEET } from "../../../src/bracket-layout.ts";

type Props = {
  tree: BracketTree;
  state: TreeState;
  /** Absent : feuille en lecture seule. */
  onChange?: (state: TreeState) => void;
  /** Arbre réel (résultats) : les cases justes et fausses sont marquées. */
  result?: TreeState;
};

/** Nom court pour une case : nom de famille (mots en capitales) et initiale du prénom, « DURAND Lucas » → « DURAND L. ». */
export function shortName(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const surname = words.filter((w) => w === w.toUpperCase() && /\p{L}/u.test(w));
  const given = words.find((w) => w !== w.toUpperCase());
  if (!surname.length || surname.length === words.length) return name;
  return `${surname.join(" ")} ${given ? `${given[0]}.` : ""}`.trim();
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 2.5;
const clamp = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

export function BracketSheet({ tree, state, onChange, result }: Props) {
  const layout = useMemo(() => layoutSheet(tree), [tree]);
  const entrants = useMemo(() => new Map([...tree.leaves.values()].map((leaf) => [leaf.entrant.athleteId, leaf.entrant])), [tree]);
  const viewport = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  const [zoom, setZoom] = useState<number | null>(null);
  const scale = zoom ?? fit;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  // Échelle « Ajuster » : toute la largeur de la feuille visible, sans agrandir au-delà de 100 %.
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => setFit(Math.min(1, Math.max(MIN_SCALE, (element.clientWidth - 2) / layout.width)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [layout.width]);

  // Pincement à deux doigts : zoom autour du point entre les doigts ; un doigt fait défiler normalement.
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    let start: { distance: number; scale: number; x: number; y: number } | null = null;
    const spread = (touches: TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      const rect = element.getBoundingClientRect();
      const midX = (event.touches[0].clientX + event.touches[1].clientX) / 2 - rect.left;
      const midY = (event.touches[0].clientY + event.touches[1].clientY) / 2 - rect.top;
      start = { distance: spread(event.touches), scale: scaleRef.current,
        x: (element.scrollLeft + midX) / scaleRef.current, y: (element.scrollTop + midY) / scaleRef.current };
    };
    const onMove = (event: TouchEvent) => {
      if (!start || event.touches.length !== 2) return;
      event.preventDefault();
      const next = clamp(start.scale * (spread(event.touches) / start.distance));
      const rect = element.getBoundingClientRect();
      const midX = (event.touches[0].clientX + event.touches[1].clientX) / 2 - rect.left;
      const midY = (event.touches[0].clientY + event.touches[1].clientY) / 2 - rect.top;
      setZoom(next);
      requestAnimationFrame(() => {
        element.scrollLeft = start ? start.x * next - midX : element.scrollLeft;
        element.scrollTop = start ? start.y * next - midY : element.scrollTop;
      });
    };
    const onEnd = (event: TouchEvent) => { if (event.touches.length < 2) start = null; };
    element.addEventListener("touchstart", onStart, { passive: true });
    element.addEventListener("touchmove", onMove, { passive: false });
    element.addEventListener("touchend", onEnd);
    element.addEventListener("touchcancel", onEnd);
    return () => {
      element.removeEventListener("touchstart", onStart);
      element.removeEventListener("touchmove", onMove);
      element.removeEventListener("touchend", onEnd);
      element.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  const inTree = new Set(Object.values(state));
  const champion = state[tree.final.id];
  const name = (id: string) => entrants.get(id)?.name ?? "—";
  const top = (y: number) => y - SHEET.boxHeight / 2;

  return (
    <div className="bracket-sheet">
      <div className="sheet-tools">
        <button type="button" onClick={() => setZoom(clamp(scale / 1.25))} aria-label="Dézoomer">−</button>
        <button type="button" onClick={() => setZoom(null)}>Ajuster</button>
        <button type="button" onClick={() => setZoom(clamp(scale * 1.25))} aria-label="Zoomer">+</button>
        <span className="muted small">{Math.round(scale * 100)} %</span>
      </div>
      <div ref={viewport} className="sheet-viewport">
        <div style={{ width: layout.width * scale, height: layout.height * scale, position: "relative" }}>
          <div className="sheet-canvas" style={{ width: layout.width, height: layout.height, transform: `scale(${scale})` }}>
            <svg className="sheet-lines" width={layout.width} height={layout.height} aria-hidden="true">
              {layout.lines.map((l, i) => <path key={i} d={`M${l.x1} ${l.y1}H${(l.x1 + l.x2) / 2}V${l.y2}H${l.x2}`} />)}
            </svg>
            {layout.labels.map((label, i) => (
              <span key={i} className="sheet-label" style={{ left: label.x, top: label.y - 8, width: label.w }}>{label.text}</span>
            ))}
            {layout.boxes.map((box) => {
              const style = { left: box.x, top: top(box.y), width: box.w };
              if (box.kind === "chip") return <span key={`chip-${box.code}-${box.side}`} className="sheet-chip" style={style}>{box.code}</span>;
              if (box.kind === "athlete") {
                const entrant = entrants.get(box.athleteId)!;
                return (
                  <button key={box.athleteId} type="button" disabled={!onChange} style={style}
                    className={`sheet-athlete side-${box.side} ${inTree.has(box.athleteId) ? "is-picked" : ""} ${champion === box.athleteId ? "is-champion" : ""}`}
                    onClick={() => onChange?.(advance(tree, state, box.athleteId))}
                    title={onChange ? "Faire avancer d'un tour" : undefined}>
                    <span className="seed">{entrant.seed ?? ""}</span>
                    <span className="name">{entrant.name}</span>
                    <span className="country">{entrant.country ?? ""}</span>
                  </button>
                );
              }
              const occupant = state[box.key];
              const verdict = result && occupant ? (result[box.key] === occupant ? "is-right" : "is-wrong") : "";
              if (!occupant) {
                return (
                  <span key={box.key} style={style} className={`sheet-slot is-empty ${box.level === 0 ? "is-final" : ""}`}
                    title={box.level === 0 ? "Vainqueur de la finale" : `Vainqueur du combat ${box.code}`}>
                    {box.level === 0 ? `Vainqueur · ${box.code}` : box.code}
                  </span>
                );
              }
              return (
                <span key={box.key} style={style}
                  className={`sheet-slot is-filled ${box.level === 0 ? "is-final" : ""} ${occupant === champion ? "is-champion" : ""} ${verdict}`}>
                  <button type="button" className="slot-name" disabled={!onChange || box.level === 0}
                    onClick={() => onChange?.(advance(tree, state, occupant))} title={name(occupant)}>
                    {box.level === 0 ? name(occupant) : shortName(name(occupant))}
                  </button>
                  {onChange && (
                    <button type="button" className="slot-clear" aria-label={`Retirer ${name(occupant)}`}
                      onClick={() => onChange(clearSlot(tree, state, box.key))}>×</button>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
