// Arbre interactif : moitiés, quarts et premiers combats du tirage officiel ; un toucher sur un athlète
// ouvre le choix de sa place. Sert au pronostic du joueur et à la saisie des résultats par l'admin.
import { useState } from "react";
import type { BracketDivision, BracketEntrant } from "../../../src/bracket-builder.ts";
import { assignPlace, PLACE_LABELS, PLACES, type Places } from "../../../src/model.ts";
import type { Place } from "../../../src/prediction.ts";

const SHORT: Record<Place, string> = { gold: "1er", silver: "2e", bronze: "3e", quarter: "Quart" };

type Props = {
  bracket: BracketDivision;
  places: Places;
  limits: Record<Place, number>;
  /** Absent : arbre en lecture seule. */
  onChange?: (places: Places) => void;
  /** Résultat réel, affiché à côté des choix. */
  result?: Places;
};

type Group = { fight?: string; entrants: BracketEntrant[] };
type Quarter = { quarter?: string; groups: Group[] };
type Half = { half?: string; quarters: Quarter[] };

function layout(bracket: BracketDivision): Half[] {
  const halves: Half[] = [];
  for (const entrant of bracket.entrants) {
    let half = halves.find((h) => h.half === entrant.half);
    if (!half) halves.push(half = { half: entrant.half, quarters: [] });
    let quarter = half.quarters.find((q) => q.quarter === entrant.quarter);
    if (!quarter) half.quarters.push(quarter = { quarter: entrant.quarter, groups: [] });
    // Premier combat du parcours : deux athlètes qui le partagent se rencontrent d'entrée.
    const fight = entrant.path[0];
    const group = quarter.groups.find((g) => g.fight === fight);
    if (group && fight) group.entrants.push(entrant);
    else quarter.groups.push({ fight, entrants: [entrant] });
  }
  return halves;
}

export const placeOf = (places: Places, athleteId: string): Place | undefined => PLACES.find((p) => places[p].includes(athleteId));

export function BracketPicker({ bracket, places, limits, onChange, result }: Props) {
  const [open, setOpen] = useState<BracketEntrant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const halves = layout(bracket);

  function choose(place: Place | null) {
    if (!open || !onChange) return;
    const next = assignPlace(places, open.athleteId, place, limits);
    if (next.error) { setError(next.error); return; }
    onChange(next.places);
    setOpen(null);
    setError(null);
  }

  return (
    <div className="picker">
      {halves.map((half, h) => (
        <section key={half.half ?? `h${h}`} className="picker-half">
          <h3>{halves.length === 2 ? (h === 0 ? "Haut du tableau" : "Bas du tableau") : `Partie ${h + 1}`}
            {half.half && <small>demi-finale · combat {half.half}</small>}</h3>
          {half.quarters.map((quarter) => (
            <div key={quarter.quarter ?? "exempts"} className="picker-quarter">
              <div className="picker-quarter-head">{quarter.quarter ? `Quart de finale · combat ${quarter.quarter}` : "Entrent en demi-finale"}</div>
              {quarter.groups.map((group, g) => (
                <div key={`${group.fight}-${g}`} className={`picker-group ${group.entrants.length > 1 ? "is-match" : ""}`}>
                  {group.entrants.map((entrant) => {
                    const mine = placeOf(places, entrant.athleteId);
                    const actual = result ? placeOf(result, entrant.athleteId) : undefined;
                    return (
                      <button key={entrant.athleteId} type="button" disabled={!onChange}
                        className={`picker-athlete ${mine ? `has-${mine}` : ""} ${result && mine ? (mine === actual ? "is-right" : "is-wrong") : ""}`}
                        onClick={() => { setOpen(entrant); setError(null); }}>
                        <span className="seed">{entrant.seed ?? ""}</span>
                        <span className="name">{entrant.name}</span>
                        <span className="country">{entrant.country ?? ""}</span>
                        {mine && <span className={`place place-${mine}`}>{SHORT[mine]}</span>}
                        {actual && <span className={`place outline place-${actual}`} title="Résultat réel">{SHORT[actual]}</span>}
                      </button>
                    );
                  })}
                  {group.entrants.length > 1 && group.fight && <span className="picker-fight">combat {group.fight}</span>}
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}

      {open && onChange && (
        <div className="sheet-backdrop" onClick={() => setOpen(null)}>
          <div className="sheet" role="dialog" aria-label={`Place de ${open.name}`} onClick={(e) => e.stopPropagation()}>
            <p className="sheet-title">{open.seed ? <span className="seed">{open.seed}</span> : null}{open.name} <span className="muted">{open.country}</span></p>
            <div className="sheet-choices">
              {PLACES.map((place) => {
                const taken = places[place].filter((id) => id !== open.athleteId).length;
                const exempt = place === "quarter" && !open.quarter;
                const current = placeOf(places, open.athleteId) === place;
                return (
                  <button key={place} type="button" className={`choice place-${place} ${current ? "is-current" : ""}`}
                    disabled={limits[place] === 0 || exempt} onClick={() => choose(place)}>
                    <strong>{PLACE_LABELS[place]}</strong>
                    <small>{exempt ? "exempt : entre directement en demi" : limits[place] > 1 ? `${taken}/${limits[place]} choisis` : taken ? "remplace le choix actuel" : ""}</small>
                  </button>
                );
              })}
            </div>
            {error && <p className="error" role="status">{error}</p>}
            <div className="sheet-actions">
              {placeOf(places, open.athleteId) && <button type="button" onClick={() => choose(null)}>Retirer</button>}
              <button type="button" onClick={() => setOpen(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Récapitulatif sous l'arbre : chaque place, les athlètes choisis et ce qu'il reste à choisir. */
export function PicksSummary({ bracket, places, limits }: { bracket: BracketDivision; places: Places; limits: Record<Place, number> }) {
  const name = (id: string) => bracket.entrants.find((e) => e.athleteId === id)?.name ?? "Athlète retiré du tirage";
  return (
    <dl className="summary-places">
      {PLACES.filter((place) => limits[place] > 0).map((place) => (
        <div key={place}>
          <dt><span className={`place place-${place}`}>{SHORT[place]}</span> {PLACE_LABELS[place]}</dt>
          <dd>
            {places[place].map((id) => <span key={id}>{name(id)}</span>)}
            {Array.from({ length: limits[place] - places[place].length }, (_, i) => <span key={`empty-${i}`} className="muted">à choisir</span>)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
