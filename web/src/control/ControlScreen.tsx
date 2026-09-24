import { useEffect, useRef, useState } from "react";
import { BracketIcon } from "../components/Icons.tsx";
import type { BracketDivision } from "../../../src/bracket-builder.ts";
import { addEntrant, moveEntrant, removeEntrant, setCategory, setFinalFight, updateEntrant } from "../../../src/bracket-editing.ts";
import { readDraw } from "../../../src/read-draw.ts";
import { withSourceAthletes } from "../../../src/source-audit.ts";
import type { ReactNode } from "react";
import { BracketView } from "./BracketView.tsx";
import { CategoryEditor } from "./CategoryEditor.tsx";
import { entryState, exportControl, sha256, summarize, type Entry, type Session } from "./control.ts";
import { EntrantEditor } from "./EntrantEditor.tsx";
import { PdfPreview } from "./PdfPreview.tsx";
import { tr } from "../i18n.tsx";

type Filter = "all" | "todo" | "done";

function statusOf(entry: Entry): { label: string; tone: string } {
  const { corrections } = entryState(entry);
  if (entry.validated) return corrections ? { label: tr(`Validée · ${corrections} corr.`, `Approved · ${corrections} corr.`), tone: "done-fixed" } : { label: tr("Validée", "Approved"), tone: "done" };
  return entry.current.status === "ok" ? { label: tr("À valider", "To approve"), tone: "todo" } : { label: tr("À revoir", "To review"), tone: "review" };
}

/**
 * `publish` : rendu par l'admin d'une compétition (lien retour et bouton « Publier » pour les divisions validées).
 * Sans lui, l'écran reste un outil de contrôle autonome (export JSON).
 */
export type PublishSlot = { back: ReactNode; render: (session: Session) => ReactNode };

export function ControlScreen({ publish }: { publish?: PublishSlot } = {}) {
  const [file, setFile] = useState<File | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [progress, setProgress] = useState<{ page: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedAthlete, setSelectedAthlete] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  // Sur petit écran, la liste des divisions et la division ouverte sont deux écrans distincts.
  const [mobileView, setMobileView] = useState<"list" | "division">("list");
  const input = useRef<HTMLInputElement>(null);

  const dirty = !!session?.entries.some((e) => e.validated || e.current !== e.original);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function importPdf(next: File) {
    if (dirty && !window.confirm(tr("Le contrôle en cours sera perdu. Pensez à l'exporter d'abord. Continuer ?", "The current review will be lost. Export it first. Continue?"))) return;
    setError(null);
    setSession(null);
    setFile(next);
    setProgress({ page: 0, total: 0 });
    try {
      const [draw, hash] = await Promise.all([
        readDraw(next, "", "all", (page, total) => setProgress({ page, total })),
        sha256(next),
      ]);
      // Vérification contre la feuille : les athlètes imprimés mais sautés par la lecture sont ajoutés à leur place et signalés.
      const entries = draw.brackets.map((d): Entry => {
        const { division, audit } = withSourceAthletes(d, draw.pages, { siblings: draw.brackets });
        return { original: d, current: division, audit, validated: false, checked: false };
      });
      setSession({ fileName: next.name, sha256: hash, pageCount: draw.pages.length,
        ocrPages: draw.pages.filter((p) => p.extractionMethod === "ocr").length, entries });
      setSelectedKey((entries.find((e) => e.current.status === "review") ?? entries[0])?.original.key ?? null);
      setSelectedAthlete(null);
      setMobileView("list");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setProgress(null);
    }
  }

  function updateEntry(key: string, change: (entry: Entry) => Entry) {
    setSession((s) => s && { ...s, entries: s.entries.map((e) => (e.original.key === key ? change(e) : e)) });
  }
  const edit = (key: string, change: (d: BracketDivision) => BracketDivision) =>
    updateEntry(key, (e) => ({ ...e, current: change(e.current), validated: false }));

  function download() {
    if (!session) return;
    const url = URL.createObjectURL(exportControl(session));
    const link = Object.assign(document.createElement("a"), { href: url, download: `controle-${session.fileName.replace(/\.pdf$/i, "")}.json` });
    link.click();
    URL.revokeObjectURL(url);
  }

  const entries = session?.entries ?? [];
  const visible = entries.filter((e) => filter === "all" || (filter === "done" ? e.validated : !e.validated));
  const entry = entries.find((e) => e.original.key === selectedKey);
  const summary = summarize(entries);

  function select(key: string) {
    setSelectedKey(key);
    setSelectedAthlete(null);
    setMobileView("division");
  }
  function validate(current: Entry) {
    updateEntry(current.original.key, (e) => ({ ...e, validated: true }));
    const index = entries.indexOf(current);
    const next = [...entries.slice(index + 1), ...entries.slice(0, index)].find((e) => !e.validated);
    if (next) select(next.original.key);
  }

  return (
    <div className="app"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void importPdf(f); }}>
      <header className="topbar">
        {publish?.back ?? <div className="brand">Taekwondo Score <span className="muted hide-narrow">· {tr("Contrôle des tirages", "Draw review")}</span></div>}
        {session && <span className="file" title={session.sha256}>{session.fileName}</span>}
        <div className="spacer" />
        <input ref={input} type="file" accept="application/pdf" hidden
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importPdf(f); }} />
        {session && publish?.render(session)}
        {session && <button onClick={download}>{tr("Exporter", "Export")}<span className="hide-narrow">{tr(" le contrôle", " review")}</span></button>}
        <button className="primary" onClick={() => input.current?.click()} disabled={!!progress}>
          {session ? <>{tr("Importer", "Import")}<span className="hide-narrow">{tr(" un autre PDF", " another PDF")}</span></> : tr("Importer un PDF", "Import a PDF")}
        </button>
      </header>

      {!session && (
        <main className="empty">
          {progress ? (
            <div className="card">
              <p><strong>{tr(`Lecture de ${file?.name}`, `Reading ${file?.name}`)}</strong></p>
              <progress max={progress.total || 1} value={progress.page} />
              <p className="muted">{progress.total ? tr(`Page ${progress.page} sur ${progress.total}`, `Page ${progress.page} of ${progress.total}`) : tr("Ouverture du PDF…", "Opening the PDF…")}</p>
            </div>
          ) : (
            <button className="dropzone" onClick={() => input.current?.click()}>
              <span className="app-mark" aria-hidden="true"><BracketIcon /></span>
              <strong>{tr("Déposez un PDF de tirage ici", "Drop a draw PDF here")}</strong>
              <span className="muted">{tr("ou cliquez pour le choisir. Le PDF est lu dans ce navigateur et n'est envoyé nulle part.", "or click to choose it. The PDF is read in this browser and sent nowhere.")}</span>
            </button>
          )}
          {error && <p className="error">{tr(`Lecture impossible : ${error}`, `Could not read the PDF: ${error}`)}</p>}
        </main>
      )}

      {session && entries.length === 0 && (
        <main className="empty">
          <div className="card">
            <p><strong>{tr("Aucune division reconnue dans ce PDF.", "No division recognised in this PDF.")}</strong></p>
            <p className="muted">{tr(`${session.pageCount} page(s) lue(s), dont ${session.ocrPages} par reconnaissance visuelle (OCR).`,
              `${session.pageCount} ${session.pageCount === 1 ? "page" : "pages"} read, ${session.ocrPages} of them by optical character recognition (OCR).`)}
              {" "}{tr("Ce format n'est peut-être pas encore pris en charge par le moteur de lecture.", "This format may not be supported by the reading engine yet.")}</p>
          </div>
        </main>
      )}

      {session && entries.length > 0 && (
        <div className="workspace" data-view={mobileView}>
          <nav className="sidebar" aria-label={tr("Divisions", "Divisions")}>
            <div className="summary">
              <div className="summary-value"><strong>{summary.validated}</strong> / {summary.total} <span className="muted">{tr("validées", "approved")}</span></div>
              <progress className="bar" max={summary.total || 1} value={summary.validated} aria-label={tr("Divisions validées", "Approved divisions")} />
              <div className="muted">{tr("Justes sans correction : ", "Correct as read: ")}<strong>{summary.validatedAsRead}</strong>/{summary.validated}
                {summary.validated > 0 && tr(` (${Math.round((summary.validatedAsRead / summary.validated) * 100)} %)`, ` (${Math.round((summary.validatedAsRead / summary.validated) * 100)}%)`)}</div>
              <div className="muted">{tr("Lues sans anomalie : ", "Read without issues: ")}{summary.readOk}/{summary.total}</div>
              {session.ocrPages > 0 && <div className="muted">{tr(`${session.ocrPages} page(s) lue(s) par OCR`, `${session.ocrPages} ${session.ocrPages === 1 ? "page" : "pages"} read by OCR`)}</div>}
            </div>
            <div className="segmented full">
              {([["all", tr("Toutes", "All")], ["todo", tr("À traiter", "To do")], ["done", tr("Validées", "Approved")]] as const).map(([value, label]) => (
                <button key={value} className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>{label}</button>
              ))}
            </div>
            <ul>
              {visible.map((e) => {
                const status = statusOf(e);
                return (
                  <li key={e.original.key}>
                    <button className={`division ${e.original.key === selectedKey ? "is-selected" : ""}`} onClick={() => select(e.original.key)}>
                      <span className={`division-dot dot-${status.tone}`} aria-hidden="true" />
                      <span className="division-name">{e.current.category}</span>
                      <span className="division-meta">
                        <span className="muted">p. {e.current.pages.join("-")} · {e.current.size} ath.</span>
                        <span className={`chip chip-${status.tone}`}>{status.label}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {entry && file ? <DivisionPanel key={entry.original.key} entry={entry} file={file}
            selectedAthlete={selectedAthlete} onSelectAthlete={setSelectedAthlete} onBack={() => setMobileView("list")}
            onEdit={(change) => edit(entry.original.key, change)}
            onCheck={(checked) => updateEntry(entry.original.key, (e) => ({ ...e, checked }))}
            onValidate={() => validate(entry)}
            onUnvalidate={() => updateEntry(entry.original.key, (e) => ({ ...e, validated: false }))}
            onReset={() => { updateEntry(entry.original.key, (e) => ({ ...e, current: e.original, validated: false })); setSelectedAthlete(null); }} />
            : <main className="empty"><p className="muted">{tr("Choisissez une division.", "Choose a division.")}</p></main>}
        </div>
      )}
    </div>
  );
}

type PanelProps = {
  entry: Entry;
  file: File;
  selectedAthlete: string | null;
  onSelectAthlete: (athleteId: string | null) => void;
  onEdit: (change: (d: BracketDivision) => BracketDivision) => void;
  onCheck: (checked: boolean) => void;
  onValidate: () => void;
  onUnvalidate: () => void;
  onReset: () => void;
  onBack: () => void;
};

function DivisionPanel({ entry, file, selectedAthlete, onSelectAthlete, onEdit, onCheck, onValidate, onUnvalidate, onReset, onBack }: PanelProps) {
  const { current, original } = entry;
  const { structural, reading, corrections, canValidate } = entryState(entry);
  // Sur petit écran, l'arbre et le PDF s'affichent l'un après l'autre, par onglets fixés en haut ;
  // chaque onglet retrouve sa position de défilement.
  const [pane, setPane] = useState<"bracket" | "pdf">("bracket");
  const panel = useRef<HTMLElement>(null);
  const tabsAnchor = useRef<HTMLDivElement>(null);
  const scrolls = useRef({ bracket: 0, pdf: 0 });
  function switchPane(next: "bracket" | "pdf") {
    const element = panel.current;
    if (next === pane || !element) { setPane(next); return; }
    const tabsTop = tabsAnchor.current?.offsetTop ?? 0;
    const pastTabs = element.scrollTop > tabsTop;
    scrolls.current[pane] = element.scrollTop;
    setPane(next);
    requestAnimationFrame(() => { if (pastTabs) element.scrollTop = Math.max(scrolls.current[next], tabsTop); });
  }
  const audit = entry.audit;
  const added = current.entrants.filter((e) => e.athleteId.startsWith("pdf-")).length;
  const auditClean = !!audit && audit.matchedRatio >= 0.8 && !audit.uncertain.length && !audit.notInSource.length
    && audit.sourceCount === current.size && (audit.declared === undefined || audit.declared === current.size);
  return (
    <main ref={panel} className={`division-panel ${selectedAthlete ? "is-editing" : ""}`}>
      <header className="division-head">
        <button className="link back" onClick={onBack}>‹ {tr("Divisions", "Divisions")}</button>
        <div>
          <p className="eyebrow">{tr(`Page ${current.pages.join("-")} · ${current.size} athlètes`, `Page ${current.pages.join("-")} · ${current.size} ${current.size === 1 ? "athlete" : "athletes"}`)}</p>
          <h1>{current.category}</h1>
          <p className="muted">{tr(`${current.semiFights.length} demi-finales · ${current.quarterFights.length} quarts`, `${current.semiFights.length} ${current.semiFights.length === 1 ? "semifinal" : "semifinals"} · ${current.quarterFights.length} ${current.quarterFights.length === 1 ? "quarterfinal" : "quarterfinals"}`)}</p>
          <CategoryEditor division={current} onChange={(patch) => onEdit((d) => setCategory(d, patch))} />
        </div>
        <div className="head-actions">
          {corrections > 0 && <button onClick={onReset}>{tr(`Revenir à la lecture (${corrections} corr.)`, `Revert to reading (${corrections} corr.)`)}</button>}
          {entry.validated ? (
            <button onClick={onUnvalidate}>{tr("Annuler la validation", "Cancel approval")}</button>
          ) : (
            <button className="primary" disabled={!canValidate} onClick={onValidate}
              title={structural.length ? tr("Corrigez d'abord les anomalies de structure.", "Fix the structure issues first.") : undefined}>{tr("Valider la division", "Approve division")}</button>
          )}
        </div>
      </header>

      {(structural.length > 0 || reading.length > 0) && (
        <div className="alerts">
          {structural.length > 0 && (
            <div className="alert alert-error">
              <strong>{tr("Structure de l'arbre à corriger", "Bracket structure to fix")}</strong>
              <ul>{structural.map((i) => <li key={i}>{i}</li>)}</ul>
            </div>
          )}
          {reading.length > 0 && (
            <div className="alert alert-warn">
              <strong>{tr("Alertes de lecture", "Reading warnings")}</strong>
              <ul>{reading.map((i) => <li key={i}>{i}</li>)}</ul>
              <label className="check">
                <input type="checkbox" checked={entry.checked} onChange={(e) => onCheck(e.target.checked)} />
                {tr("J'ai comparé chaque athlète (nom, pays, tête de série, place) au PDF.", "I compared each athlete (name, country, seed, place) with the PDF.")}
              </label>
            </div>
          )}
        </div>
      )}
      {audit && audit.matchedRatio >= 0.8 && (
        <p className={`audit-line ${auditClean ? "is-clean" : ""}`}>
          {tr(`Vérification du PDF : ${audit.sourceCount} nom(s) relu(s) sur la feuille`, `PDF check: ${audit.sourceCount} ${audit.sourceCount === 1 ? "name" : "names"} read again on the sheet`)}
          {audit.declared !== undefined && tr(`, ${audit.declared} annoncé(s)`, `, ${audit.declared} announced`)}
          {" "}· {tr(`${current.size} dans l'arbre`, `${current.size} in the bracket`)}{added > 0 && tr(`, dont ${added} ajouté(s) du PDF`, `, including ${added} added from PDF`)}.{auditClean && tr(" Tout correspond.", " Everything matches.")}
        </p>
      )}
      {entry.validated && <div className="alert alert-ok">{corrections
        ? tr(`Division validée après ${corrections} correction(s).`, `Division approved after ${corrections} ${corrections === 1 ? "correction" : "corrections"}.`)
        : tr("Division validée telle que lue.", "Division approved as read.")}</div>}

      <div ref={tabsAnchor} aria-hidden="true" />
      <div className="segmented full pane-tabs" role="tablist" aria-label={tr("Affichage", "View")}>
        <button role="tab" aria-selected={pane === "bracket"} className={pane === "bracket" ? "is-active" : ""} onClick={() => switchPane("bracket")}>{tr("Arbre reconstruit", "Rebuilt bracket")}</button>
        <button role="tab" aria-selected={pane === "pdf"} className={pane === "pdf" ? "is-active" : ""} onClick={() => switchPane("pdf")}>{tr("PDF source", "Source PDF")}</button>
      </div>
      <div className={`split show-${pane}`}>
        <PdfPreview file={file} pages={current.pages} />
        <section className="bracket-pane" aria-label={tr("Arbre reconstruit", "Rebuilt bracket")}>
          <BracketView division={current} original={original} selected={selectedAthlete ?? undefined}
            onSelect={onSelectAthlete}
            onFinalChange={(finalFight) => onEdit((d) => setFinalFight(d, finalFight))}
            onAdd={(placement) => {
              const added = addEntrant(current, placement);
              onEdit(() => added.division);
              onSelectAthlete(added.athleteId);
            }} />
          {selectedAthlete && (
            <EntrantEditor division={current} original={original} athleteId={selectedAthlete}
              onChange={(patch) => onEdit((d) => updateEntrant(d, selectedAthlete, patch))}
              onMove={(delta) => onEdit((d) => moveEntrant(d, selectedAthlete, delta))}
              onRemove={() => { onEdit((d) => removeEntrant(d, selectedAthlete)); onSelectAthlete(null); }}
              onClose={() => onSelectAthlete(null)} />
          )}
        </section>
      </div>
    </main>
  );
}
