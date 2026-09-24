// Français / anglais : fournisseur React et sélecteur FR / EN. La logique (tr, placeLabel…) est dans i18n-core.ts.
// Langue : choix enregistré sur l'appareil, sinon celle du téléphone (français si elle commence par « fr », anglais sinon).
// Changer de langue remonte toute l'app : les textes, dates et nombres suivent sans autre mécanique.
import { createContext, Fragment, useContext, useEffect, useState, type ReactNode } from "react";
import { lang, setCurrentLang, tr, type Lang } from "./i18n-core.ts";

export * from "./i18n-core.ts";

const LangContext = createContext<{ lang: Lang; setLang: (lang: Lang) => void }>({ lang: lang(), setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<Lang>(lang);
  useEffect(() => { document.documentElement.lang = value; }, [value]);
  const setLang = (next: Lang) => { setCurrentLang(next); setValue(next); };
  return <LangContext.Provider value={{ lang: value, setLang }}><Fragment key={value}>{children}</Fragment></LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);

/** Bouton FR / EN (commande segmentée). */
export function LangSwitch({ compact = false }: { compact?: boolean }) {
  const { lang: value, setLang } = useLang();
  return (
    <div className={`segmented lang-switch ${compact ? "is-compact" : ""}`} role="group" aria-label={tr("Langue", "Language")}>
      <button type="button" className={value === "fr" ? "is-active" : ""} aria-pressed={value === "fr"} onClick={() => setLang("fr")}>{compact ? "FR" : "Français"}</button>
      <button type="button" className={value === "en" ? "is-active" : ""} aria-pressed={value === "en"} onClick={() => setLang("en")}>{compact ? "EN" : "English"}</button>
    </div>
  );
}

