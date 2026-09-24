// « Mon pronostic » en liste groupée : une ligne par place à pourvoir (1er, 2e, 3es, battus en quart), choisie ou non.
import type { BracketDivision } from "../../../src/bracket-builder.ts";
import { PLACES, type Places } from "../../../src/model.ts";
import type { Place } from "../../../src/prediction.ts";
import { flagOf } from "../../../src/flags.ts";
import { placeLabel, placeShort, tr } from "../i18n.tsx";

export function PicksSummary({ bracket, places, limits, emptyLabel }: { bracket: BracketDivision; places: Places; limits: Record<Place, number>; emptyLabel?: string }) {
  const entrant = (id: string) => bracket.entrants.find((e) => e.athleteId === id);
  return (
    <ul className="picks-list">
      {PLACES.filter((place) => limits[place] > 0).flatMap((place) => Array.from({ length: limits[place] }, (_, i) => {
        const id = places[place][i];
        const who = id ? entrant(id) : undefined;
        return (
          <li key={`${place}-${i}`}>
            <span className={`place place-${place}`}>{placeShort(place)}</span>
            {id ? (
              <span className="pick-name">
                {flagOf(who?.country) && <span className="flag" aria-hidden="true">{flagOf(who?.country)}</span>}
                {who?.name ?? tr("Athlète retiré du tirage", "Athlete removed from the draw")}
              </span>
            ) : <span className="pick-name muted">{emptyLabel ?? tr("À choisir", "To pick")}</span>}
            <span className="pick-label muted small">{placeLabel(place)}</span>
          </li>
        );
      }))}
    </ul>
  );
}
