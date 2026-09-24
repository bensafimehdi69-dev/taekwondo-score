import type { BracketDivision, BracketEntrant } from "../../../src/bracket-builder.ts";
import { flagOf } from "../../../src/flags.ts";
import { entrantChange } from "./control.ts";
import { tr } from "../i18n.tsx";

type QuarterGroup = { quarter?: string; entrants: BracketEntrant[] };
type HalfGroup = { half?: string; side: BracketEntrant["side"]; quarters: QuarterGroup[] };

/** Regroupe les athlètes par moitié (demi-finale) puis par quart, dans l'ordre de lecture de l'arbre. */
function groupBracket(division: BracketDivision): HalfGroup[] {
  const halves: HalfGroup[] = [];
  for (const entrant of division.entrants) {
    let half = halves.find((h) => h.half === entrant.half);
    if (!half) halves.push(half = { half: entrant.half, side: entrant.side, quarters: [] });
    let quarter = half.quarters.find((q) => q.quarter === entrant.quarter);
    if (!quarter) half.quarters.push(quarter = { quarter: entrant.quarter, entrants: [] });
    quarter.entrants.push(entrant);
  }
  return halves.sort((a, b) => Number(!a.half) - Number(!b.half));
}

type Props = {
  division: BracketDivision;
  original: BracketDivision;
  selected?: string;
  onSelect: (athleteId: string) => void;
  onAdd: (placement: { half?: string; quarter?: string }) => void;
  onFinalChange: (finalFight: string) => void;
};

export function BracketView({ division, original, selected, onSelect, onAdd, onFinalChange }: Props) {
  const halves = groupBracket(division);
  return (
    <div className="bracket">
      <label className="bracket-final">{tr("Finale · combat", "Final · bout")}
        <input value={division.finalFight ?? ""} placeholder={tr("à saisir", "to enter")} onChange={(e) => onFinalChange(e.target.value)} />
        {division.finalFight !== original.finalFight && <span className="tag tag-changed">{tr("corrigé", "corrected")}</span>}
      </label>
      <div className="halves">
        {halves.map((half) => (
          <section key={half.half ?? "none"} className={`half ${half.half ? "" : "is-orphan"}`}>
            <header>
              <strong>{half.half ? tr(`Demi-finale · combat ${half.half}`, `Semifinal · bout ${half.half}`) : tr("Sans demi-finale", "No semifinal")}</strong>
              {half.half && <span className="muted">{half.side === "left" ? tr("côté gauche", "left side") : tr("côté droit", "right side")}</span>}
            </header>
            {half.quarters.map((group) => (
              <div key={group.quarter ?? "exempt"} className="quarter">
                <div className="quarter-head">
                  <span>{group.quarter ? tr(`Quart · combat ${group.quarter}`, `Quarterfinal · bout ${group.quarter}`) : half.half ? tr("Entrent en demi-finale", "Enter at the semifinal") : tr("Sans quart ni demi-finale", "No quarterfinal or semifinal")}</span>
                  <button className="link" onClick={() => onAdd({ half: half.half, quarter: group.quarter })}>{tr("+ Ajouter", "+ Add")}</button>
                </div>
                <ol>
                  {group.entrants.map((e) => {
                    const change = entrantChange(original, e);
                    return (
                      <li key={e.athleteId}>
                        <button className={`entrant ${e.athleteId === selected ? "is-selected" : ""}`} onClick={() => onSelect(e.athleteId)}>
                          <span className="seed" title={e.seed ? tr(`Tête de série ${e.seed}`, `Seed ${e.seed}`) : tr("Non tête de série", "Unseeded")}>{e.seed ?? ""}</span>
                          <span className="name">{e.name || <em>{tr("Sans nom", "No name")}</em>}</span>
                          <span className="country">{flagOf(e.country) && <span className="flag" aria-hidden="true">{flagOf(e.country)}</span>}{e.country ?? "—"}</span>
                          <span className="fight" title={tr("Premier combat", "First bout")}>{e.path[0] ?? ""}</span>
                          {change && <span className={`tag tag-${change}`}>{change === "added" ? (e.athleteId.startsWith("pdf-") ? tr("ajouté du PDF", "added from PDF") : tr("ajouté", "added")) : tr("corrigé", "corrected")}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
