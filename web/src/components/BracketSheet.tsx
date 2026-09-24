// Feuille de tirage interactive, de la même forme que le PDF officiel : on touche un athlète, on lui donne sa place
// (1er, 2e, 3e, battu en quart) et son chemin se dessine dans l'arbre. Zoom par boutons ou pincement.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { allowedPlaces, setPlace, stateFromPlaces, type BracketTree, type PlaceChange } from "../../../src/bracket-tree.ts";
import { layoutSheet, SHEET } from "../../../src/bracket-layout.ts";
import { flagOf } from "../../../src/flags.ts";
import { PLACES, type Places } from "../../../src/model.ts";
import type { Place } from "../../../src/prediction.ts";
import { placeShort, tr } from "../i18n.tsx";

type Props = {
  tree: BracketTree;
  places: Places;
  /** Absent : feuille en lecture seule. */
  onChange?: (places: Places) => void;
  /** Classement réel (résultats) : les cases et les places justes ou fausses sont marquées. */
  result?: Places;
};

const option = (place: Place) => ({
  gold: tr("Vainqueur", "Winner"),
  silver: tr("Finaliste : perd la finale", "Finalist: loses the final"),
  bronze: tr("Bronze : perd en demi-finale", "Bronze: loses in the semifinal"),
  quarter: tr("Battu en quart de finale", "Lost in quarterfinal"),
})[place];

/** Nom court pour une case : nom de famille (mots en capitales) et initiale du prénom, « DURAND Lucas » → « DURAND L. ». */
export function shortName(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const surname = words.filter((w) => w === w.toUpperCase() && /\p{L}/u.test(w));
  const given = words.find((w) => w !== w.toUpperCase());
  if (!surname.length || surname.length === words.length) return name;
  return `${surname.join(" ")} ${given ? `${given[0]}.` : ""}`.trim();
}

const placeMap = (places: Places) => new Map(PLACES.flatMap((p) => places[p].map((id) => [id, p] as const)));

const MIN_SCALE = 0.25;
const MAX_SCALE = 2.5;
const clamp = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

export function BracketSheet({ tree, places, onChange, result }: Props) {
  const layout = useMemo(() => layoutSheet(tree), [tree]);
  const entrants = useMemo(() => new Map([...tree.leaves.values()].map((leaf) => [leaf.entrant.athleteId, leaf.entrant])), [tree]);
  // Places qui existent dans cette division (pas de quart dans un tableau de 4, par exemple).
  const possible = useMemo(() => new Set([...tree.leaves.keys()].flatMap((id) => allowedPlaces(tree, id))), [tree]);
  const state = useMemo(() => stateFromPlaces(tree, places), [tree, places]);
  const actual = useMemo(() => (result ? stateFromPlaces(tree, result) : undefined), [tree, result]);
  const [picking, setPicking] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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

  useEffect(() => {
    if (!picking) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setPicking(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picking]);

  const placeOf = placeMap(places);
  const actualPlaceOf = result ? placeMap(result) : undefined;
  const name = (id: string) => entrants.get(id)?.name ?? "—";
  const flag = (id: string) => flagOf(entrants.get(id)?.country);
  const describe = (changes: PlaceChange[]) => changes
    .map((c) => tr(`${shortName(name(c.athleteId))} : ${placeShort(c.from)} → ${c.to ? placeShort(c.to) : "retiré"}`, `${shortName(name(c.athleteId))}: ${placeShort(c.from)} → ${c.to ? placeShort(c.to) : "removed"}`)).join(" · ");
  const top = (y: number) => y - SHEET.boxHeight / 2;
  const open = onChange ? (athleteId: string) => setPicking(athleteId) : undefined;

  function choose(athleteId: string, place: Place | null) {
    if (!onChange) return;
    const next = setPlace(tree, places, athleteId, place);
    onChange(next.places);
    setPicking(null);
    const who = shortName(name(athleteId));
    setNotice(tr(`${place ? `${who} : ${placeShort(place)}` : `${who} retiré`}${next.changes.length ? `. Change aussi : ${describe(next.changes)}` : ""}`,
      `${place ? `${who}: ${placeShort(place)}` : `${who} removed`}${next.changes.length ? `. Also changes: ${describe(next.changes)}` : ""}`));
  }

  return (
    <div className="bracket-sheet">
      <div className="sheet-tools">
        <button type="button" onClick={() => setZoom(clamp(scale / 1.25))} aria-label={tr("Dézoomer", "Zoom out")}>−</button>
        <button type="button" onClick={() => setZoom(null)}>{tr("Ajuster", "Fit")}</button>
        <button type="button" onClick={() => setZoom(clamp(scale * 1.25))} aria-label={tr("Zoomer", "Zoom in")}>+</button>
        <span className="muted small">{tr(`${Math.round(scale * 100)} %`, `${Math.round(scale * 100)}%`)}</span>
      </div>
      {notice && <p className="sheet-notice small" role="status">{notice}</p>}
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
                const place = placeOf.get(box.athleteId);
                const verdict = actualPlaceOf && place ? (actualPlaceOf.get(box.athleteId) === place ? "is-right" : "is-wrong") : "";
                return (
                  <button key={box.athleteId} type="button" disabled={!onChange} style={style}
                    className={`sheet-athlete side-${box.side} ${place ? `has-place path-${place}` : ""}`}
                    onClick={() => open?.(box.athleteId)} title={onChange ? tr("Choisir sa place", "Choose their place") : undefined}>
                    <span className="seed">{entrant.seed ?? ""}</span>
                    <span className="name">{entrant.name}</span>
                    <span className="country">{flagOf(entrant.country) && <span className="flag" aria-hidden="true">{flagOf(entrant.country)}</span>}{entrant.country ?? ""}</span>
                    {place && <span className={`place place-${place} ${verdict}`}>{placeShort(place)}</span>}
                  </button>
                );
              }
              const occupant = state[box.key];
              if (!occupant) {
                return (
                  <span key={box.key} style={style} className={`sheet-slot is-empty ${box.level === 0 ? "is-final" : ""}`}
                    title={box.level === 0 ? tr("Vainqueur de la finale", "Winner of the final") : tr(`Vainqueur du combat ${box.code}`, `Winner of bout ${box.code}`)}>
                    {box.level === 0 ? tr(`Vainqueur · ${box.code}`, `Winner · ${box.code}`) : box.code}
                  </span>
                );
              }
              const verdict = actual ? (actual[box.key] === occupant ? "is-right" : "is-wrong") : "";
              return (
                <button key={box.key} type="button" style={style} disabled={!onChange} title={name(occupant)}
                  className={`sheet-slot is-filled path-${placeOf.get(occupant)} ${box.level === 0 ? "is-final" : ""} ${verdict}`}
                  onClick={() => open?.(occupant)}>
                  {flag(occupant) && <span className="flag" aria-hidden="true">{flag(occupant)}</span>}
                  {box.level === 0 ? name(occupant) : shortName(name(occupant))}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {picking && createPortal(
        <div className="sheet-backdrop" onClick={() => setPicking(null)}>
          <div className="sheet" role="dialog" aria-label={tr(`Place de ${name(picking)}`, `Place of ${name(picking)}`)} onClick={(e) => e.stopPropagation()}>
            <p className="sheet-title">{flag(picking) && <span className="flag" aria-hidden="true">{flag(picking)}</span>}{name(picking)}
              <span className="muted small">{[entrants.get(picking)?.country, entrants.get(picking)?.seed ? tr(`tête de série ${entrants.get(picking)?.seed}`, `seed ${entrants.get(picking)?.seed}`) : ""].filter(Boolean).join(" · ")}</span>
            </p>
            <div className="place-options">
              {PLACES.filter((place) => possible.has(place)).map((place) => {
                const allowed = allowedPlaces(tree, picking).includes(place);
                const current = placeOf.get(picking) === place;
                const preview = allowed && !current ? setPlace(tree, places, picking, place).changes : [];
                return (
                  <button key={place} type="button" disabled={!allowed} onClick={() => choose(picking, place)}
                    className={`place-option ${current ? "is-current" : ""}`} aria-pressed={current}>
                    <span className={`place place-${place}`}>{placeShort(place)}</span>
                    <span className="option-text">
                      <span>{option(place)}</span>
                      {!allowed && <small className="muted">{place === "quarter" ? tr("Entre directement en demi-finale", "Enters directly in the semifinal") : tr("Entre directement en finale", "Enters directly in the final")}</small>}
                      {preview.length > 0 && <small className="option-effect">{tr("Change aussi :", "Also changes:")} {describe(preview)}</small>}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="sheet-actions">
              {placeOf.has(picking) && <button type="button" className="danger" onClick={() => choose(picking, null)}>{tr("Retirer sa place", "Remove their place")}</button>}
              <button type="button" onClick={() => setPicking(null)}>{tr("Annuler", "Cancel")}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
