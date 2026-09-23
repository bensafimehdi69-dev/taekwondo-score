import { useEffect, useRef, useState } from "react";
import type { BracketDivision } from "../../../src/bracket-builder.ts";
import { addEntrant, moveEntrant, removeEntrant, setFinalFight, updateEntrant } from "../../../src/bracket-editing.ts";
import { readDraw } from "../../../src/read-draw.ts";
import type { ReactNode } from "react";
import { BracketView } from "./BracketView.tsx";
import { entryState, exportControl, sha256, summarize, type Entry, type Session } from "./control.ts";
import { EntrantEditor } from "./EntrantEditor.tsx";
import { PdfPreview } from "./PdfPreview.tsx";

type Filter = "all" | "todo" | "done";

function statusOf(entry: Entry): { label: string; tone: string } {
  const { corrections } = entryState(entry);
  if (entry.validated) return corrections ? { label: `Validée · ${corrections} corr.`, tone: "done-fixed" } : { label: "Validée", tone: "done" };
  return entry.current.status === "ok" ? { label: "À valider", tone: "todo" } : { label: "À revoir", tone: "review" };
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
    if (dirty && !window.confirm("Le contrôle en cours sera perdu. Pensez à l'exporter d'abord. Continuer ?")) return;
    setError(null);
    setSession(null);
    setFile(next);
    setProgress({ page: 0, total: 0 });
    try {
      const [draw, hash] = await Promise.all([
        readDraw(next, "", "all", (page, total) => setProgress({ page, total })),
        sha256(next),
      ]);
      const entries = draw.brackets.map((d): Entry => ({ original: d, current: d, validated: false, checked: false }));
      setSession({ fileName: next.name, sha256: hash, pageCount: draw.pages.length,
        ocrPages: draw.pages.filter((p) => p.extractionMethod === "ocr").length, entries });
      setSelectedKey((entries.find((e) => e.original.status === "review") ?? entries[0])?.original.key ?? null);
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
        {publish?.back ?? <div className="brand">Taekwondo Score <span className="muted hide-narrow">· Contrôle des tirages</span></div>}
        {session && <span className="file" title={session.sha256}>{session.fileName}</span>}
        <div className="spacer" />
        <input ref={input} type="file" accept="application/pdf" hidden
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importPdf(f); }} />
        {session && publish?.render(session)}
        {session && <button onClick={download}>Exporter<span className="hide-narrow"> le contrôle</span></button>}
        <button className="primary" onClick={() => input.current?.click()} disabled={!!progress}>
          {session ? <>Importer<span className="hide-narrow"> un autre PDF</span></> : "Importer un PDF"}
        </button>
      </header>

      {!session && (
        <main className="empty">
          {progress ? (
            <div className="card">
              <p><strong>Lecture de {file?.name}</strong></p>
              <progress max={progress.total || 1} value={progress.page} />
              <p className="muted">{progress.total ? `Page ${progress.page} sur ${progress.total}` : "Ouverture du PDF…"}</p>
            </div>
          ) : (
            <button className="dropzone" onClick={() => input.current?.click()}>
              <strong>Déposez un PDF de tirage ici</strong>
              <span className="muted">ou cliquez pour le choisir. Le PDF est lu dans ce navigateur et n'est envoyé nulle part.</span>
            </button>
          )}
          {error && <p className="error">Lecture impossible : {error}</p>}
        </main>
      )}

      {session && entries.length === 0 && (
        <main className="empty">
          <div className="card">
            <p><strong>Aucune division reconnue dans ce PDF.</strong></p>
            <p className="muted">{session.pageCount} page(s) lue(s), dont {session.ocrPages} par reconnaissance visuelle (OCR).
              Ce format n'est peut-être pas encore pris en charge par le moteur de lecture.</p>
          </div>
        </main>
      )}

      {session && entries.length > 0 && (
        <div className="workspace" data-view={mobileView}>
          <nav className="sidebar" aria-label="Divisions">
            <div className="summary">
              <div><strong>{summary.validated}</strong>/{summary.total} validées</div>
              <div className="muted">Justes sans correction : <strong>{summary.validatedAsRead}</strong>/{summary.validated}
                {summary.validated > 0 && ` (${Math.round((summary.validatedAsRead / summary.validated) * 100)} %)`}</div>
              <div className="muted">Lues sans anomalie : {summary.readOk}/{summary.total}</div>
              {session.ocrPages > 0 && <div className="muted">{session.ocrPages} page(s) lue(s) par OCR</div>}
            </div>
            <div className="segmented full">
              {([["all", "Toutes"], ["todo", "À traiter"], ["done", "Validées"]] as const).map(([value, label]) => (
                <button key={value} className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>{label}</button>
              ))}
            </div>
            <ul>
              {visible.map((e) => {
                const status = statusOf(e);
                return (
                  <li key={e.original.key}>
                    <button className={`division ${e.original.key === selectedKey ? "is-selected" : ""}`} onClick={() => select(e.original.key)}>
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
            : <main className="empty"><p className="muted">Choisissez une division.</p></main>}
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
  // Sur petit écran, l'arbre et le PDF s'affichent l'un après l'autre, par onglets.
  const [pane, setPane] = useState<"bracket" | "pdf">("bracket");
  return (
    <main className={`division-panel ${selectedAthlete ? "is-editing" : ""}`}>
      <header className="division-head">
        <button className="link back" onClick={onBack}>← Divisions</button>
        <div>
          <h1>{current.category}</h1>
          <p className="muted">{current.size} athlètes · {current.semiFights.length} demi-finales · {current.quarterFights.length} quarts · page {current.pages.join("-")}</p>
        </div>
        <div className="head-actions">
          {corrections > 0 && <button onClick={onReset}>Revenir à la lecture ({corrections} corr.)</button>}
          {entry.validated ? (
            <button onClick={onUnvalidate}>Annuler la validation</button>
          ) : (
            <button className="primary" disabled={!canValidate} onClick={onValidate}
              title={structural.length ? "Corrigez d'abord les anomalies de structure." : undefined}>Valider la division</button>
          )}
        </div>
      </header>

      {(structural.length > 0 || reading.length > 0) && (
        <div className="alerts">
          {structural.length > 0 && (
            <div className="alert alert-error">
              <strong>Structure de l'arbre à corriger</strong>
              <ul>{structural.map((i) => <li key={i}>{i}</li>)}</ul>
            </div>
          )}
          {reading.length > 0 && (
            <div className="alert alert-warn">
              <strong>Alertes de lecture</strong>
              <ul>{reading.map((i) => <li key={i}>{i}</li>)}</ul>
              <label className="check">
                <input type="checkbox" checked={entry.checked} onChange={(e) => onCheck(e.target.checked)} />
                J'ai comparé chaque athlète (nom, pays, tête de série, place) au PDF.
              </label>
            </div>
          )}
        </div>
      )}
      {entry.validated && <div className="alert alert-ok">Division validée{corrections ? ` après ${corrections} correction(s)` : " telle que lue"}.</div>}

      <div className="segmented full pane-tabs" role="tablist" aria-label="Affichage">
        <button role="tab" aria-selected={pane === "bracket"} className={pane === "bracket" ? "is-active" : ""} onClick={() => setPane("bracket")}>Arbre reconstruit</button>
        <button role="tab" aria-selected={pane === "pdf"} className={pane === "pdf" ? "is-active" : ""} onClick={() => setPane("pdf")}>PDF source</button>
      </div>
      <div className={`split show-${pane}`}>
        <PdfPreview file={file} pages={current.pages} />
        <section className="bracket-pane" aria-label="Arbre reconstruit">
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
