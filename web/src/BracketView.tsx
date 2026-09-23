import type { BracketDivision, BracketEntrant } from "../../src/bracket-builder.ts";
import { entrantChange } from "./control.ts";

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
      <label className="bracket-final">Finale · combat
        <input value={division.finalFight ?? ""} placeholder="à saisir" onChange={(e) => onFinalChange(e.target.value)} />
        {division.finalFight !== original.finalFight && <span className="tag tag-changed">corrigé</span>}
      </label>
      <div className="halves">
        {halves.map((half) => (
          <section key={half.half ?? "none"} className={`half ${half.half ? "" : "is-orphan"}`}>
            <header>
              <strong>{half.half ? `Demi-finale · combat ${half.half}` : "Sans demi-finale"}</strong>
              {half.half && <span className="muted">côté {half.side === "left" ? "gauche" : "droit"}</span>}
            </header>
            {half.quarters.map((group) => (
              <div key={group.quarter ?? "exempt"} className="quarter">
                <div className="quarter-head">
                  <span>{group.quarter ? `Quart · combat ${group.quarter}` : half.half ? "Entrent en demi-finale" : "Sans quart ni demi-finale"}</span>
                  <button className="link" onClick={() => onAdd({ half: half.half, quarter: group.quarter })}>+ Ajouter</button>
                </div>
                <ol>
                  {group.entrants.map((e) => {
                    const change = entrantChange(original, e);
                    return (
                      <li key={e.athleteId}>
                        <button className={`entrant ${e.athleteId === selected ? "is-selected" : ""}`} onClick={() => onSelect(e.athleteId)}>
                          <span className="seed" title={e.seed ? `Tête de série ${e.seed}` : "Non tête de série"}>{e.seed ?? ""}</span>
                          <span className="name">{e.name || <em>Sans nom</em>}</span>
                          <span className="country">{e.country ?? "—"}</span>
                          <span className="fight" title="Premier combat">{e.path[0] ?? ""}</span>
                          {change && <span className={`tag tag-${change}`}>{change === "added" ? "ajouté" : "corrigé"}</span>}
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
