import { useState } from "react";
import type { BracketDivision } from "../../../src/bracket-builder.ts";
import type { CategoryPatch } from "../../../src/bracket-editing.ts";
import { tr } from "../i18n.tsx";

const AGES = ["Senior", "Junior", "Cadet", "U21", "Children", "Master"];

/** Catégorie de la division : à compléter quand la feuille ne l'imprime pas en entier (« To confirm »). */
export function CategoryEditor({ division, onChange }: { division: BracketDivision; onChange: (patch: CategoryPatch) => void }) {
  const incomplete = [division.ageCategory, division.genderCategory, division.weightCategory].includes("To confirm");
  const [open, setOpen] = useState(incomplete);
  const value = (v: string) => (v === "To confirm" ? "" : v);
  return (
    <div className={`category-editor ${incomplete ? "is-incomplete" : ""}`}>
      {incomplete && <p>{tr("Catégorie incomplète sur la feuille : complète-la avant de publier (les joueurs verraient « To confirm »).", "Category incomplete on the sheet: complete it before publishing (players would see “To confirm”).")}</p>}
      {!open && <button className="link" onClick={() => setOpen(true)}>{tr("Modifier la catégorie", "Edit category")}</button>}
      {open && (
        <div className="category-fields">
          <label>{tr("Âge", "Age")}
            <input list="age-categories" value={value(division.ageCategory)} placeholder={tr("ex. Senior", "e.g. Senior")} onChange={(e) => onChange({ ageCategory: e.target.value })} />
          </label>
          <label>{tr("Genre", "Gender")}
            <select value={division.genderCategory} onChange={(e) => onChange({ genderCategory: e.target.value })}>
              <option value="Men">Men</option>
              <option value="Women">Women</option>
              <option value="Open">Open</option>
              {!["Men", "Women", "Open"].includes(division.genderCategory) && <option value={division.genderCategory}>{division.genderCategory}</option>}
            </select>
          </label>
          <label>{tr("Poids", "Weight")}
            <input value={value(division.weightCategory)} placeholder={tr("ex. -58 kg", "e.g. -58 kg")} onChange={(e) => onChange({ weightCategory: e.target.value })} />
          </label>
          <datalist id="age-categories">{AGES.map((age) => <option key={age} value={age} />)}</datalist>
        </div>
      )}
    </div>
  );
}
