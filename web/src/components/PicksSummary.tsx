// Récapitulatif des places, déduites de l'arbre : ce qui est décidé et ce qui reste à choisir.
import type { BracketDivision } from "../../../src/bracket-builder.ts";
import { PLACE_LABELS, PLACES, type Places } from "../../../src/model.ts";
import type { Place } from "../../../src/prediction.ts";
import { flagOf } from "../../../src/flags.ts";

export const SHORT: Record<Place, string> = { gold: "1er", silver: "2e", bronze: "3e", quarter: "Quart" };

export function PicksSummary({ bracket, places, limits }: { bracket: BracketDivision; places: Places; limits: Record<Place, number> }) {
  const name = (id: string) => bracket.entrants.find((e) => e.athleteId === id)?.name ?? "Athlète retiré du tirage";
  const flag = (id: string) => flagOf(bracket.entrants.find((e) => e.athleteId === id)?.country);
  return (
    <dl className="summary-places">
      {PLACES.filter((place) => limits[place] > 0).map((place) => (
        <div key={place}>
          <dt><span className={`place place-${place}`}>{SHORT[place]}</span> {PLACE_LABELS[place]}</dt>
          <dd>
            {places[place].map((id) => <span key={id}>{flag(id) && <span className="flag" aria-hidden="true">{flag(id)}</span>}{name(id)}</span>)}
            {Array.from({ length: Math.max(0, limits[place] - places[place].length) }, (_, i) => <span key={`empty-${i}`} className="muted">à décider</span>)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
