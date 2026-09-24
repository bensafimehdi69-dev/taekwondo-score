import { useState } from "react";
import { divisionDoc, zonedTimeToUtc, type DivisionStatus } from "../../../../src/model.ts";
import { ControlScreen } from "../../control/ControlScreen.tsx";
import type { Session } from "../../control/control.ts";
import { getCompetition, publishDivisions, type WithId } from "../../data.ts";
import { adminError, formatDay } from "../../format.ts";
import { tr } from "../../i18n.tsx";
import { Link } from "../../router.tsx";
import { useAsync } from "../../useAsync.ts";
import type { CompetitionDoc } from "../../../../src/model.ts";

/** Import d'un PDF de tirage dans une compétition : contrôle, puis publication des divisions validées. */
export function AdminImportPage({ cid, day }: { cid: string; day?: string }) {
  const { data: competition } = useAsync(() => getCompetition(cid), [cid]);
  return (
    <ControlScreen publish={{
      back: <Link to={`/admin/competitions/${cid}`} className="brand">‹ {competition?.name ?? tr("Compétition", "Competition")}{day ? ` · ${formatDay(day, { weekday: "short", day: "numeric", month: "short" })}` : ""}</Link>,
      render: (session) => competition ? <PublishButton cid={cid} competition={competition} session={session} initialDay={day} /> : null,
    }} />
  );
}

function PublishButton({ cid, competition, session, initialDay }: { cid: string; competition: WithId<CompetitionDoc>; session: Session; initialDay?: string }) {
  const validated = session.entries.filter((e) => e.validated);
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(initialDay ?? competition.startDate);
  const [time, setTime] = useState("09:00");
  const [status, setStatus] = useState<DivisionStatus>("open");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [done, setDone] = useState(false);
  let lockAt: Date | null = null;
  try { lockAt = zonedTimeToUtc(day, time, competition.timezone); } catch { lockAt = null; }
  const lockInPast = !!lockAt && lockAt.getTime() <= Date.now();

  async function publish() {
    if (!lockAt) return;
    setBusy(true);
    setMessage(null);
    try {
      const docs = validated.map((entry) => divisionDoc(entry.current, {
        day, lockAt: lockAt!, status,
        source: { fileName: session.fileName, sha256: session.sha256, pages: entry.current.pages },
      }));
      const saved = await publishDivisions(cid, docs);
      const count = (outcome: string) => saved.filter((s) => s.outcome === outcome).length;
      const parts = [
        count("created") && tr(`${count("created")} nouvelle(s)`, `${count("created")} new`),
        count("corrected") && tr(`${count("corrected")} corrigée(s) : nouvelle version, les joueurs concernés devront vérifier leur pronostic`,
          `${count("corrected")} corrected: new version, the players concerned will need to check their prediction`),
        count("unchanged") && tr(`${count("unchanged")} déjà publiée(s) à l'identique : jour, heure et statut mis à jour, pronostics conservés`,
          `${count("unchanged")} already published unchanged: day, time and status updated, predictions kept`),
      ].filter(Boolean);
      setMessage({ tone: "ok", text: tr(`Publication réussie. ${parts.join(" ; ")}.`, `Published. ${parts.join("; ")}.`) });
      setDone(true);
    } catch (cause) {
      setMessage({ tone: "error", text: adminError(cause) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="primary" disabled={!validated.length} onClick={() => { setOpen(true); setMessage(null); setDone(false); }}
        title={validated.length ? undefined : tr("Valide d'abord au moins une division.", "Validate at least one division first.")}>
        {tr("Publier", "Publish")}<span className="hide-narrow"> ({validated.length})</span>
      </button>
      {open && (
        <div className="sheet-backdrop" onClick={() => !busy && setOpen(false)}>
          <div className="sheet" role="dialog" aria-label={tr("Publier les divisions validées", "Publish the validated divisions")} onClick={(e) => e.stopPropagation()}>
            <p className="sheet-title">{tr(`Publier ${validated.length} division(s) validée(s)`, `Publish ${validated.length} validated division${validated.length === 1 ? "" : "s"}`)}</p>
            <div className="form">
              <label>{tr("Jour de compétition", "Competition day")}<input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></label>
              <label>{tr(`Heure de verrouillage (heure de ${competition.timezone})`, `Lock time (${competition.timezone} time)`)}
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </label>
              <label>{tr("Statut", "Status")}
                <select value={status} onChange={(e) => setStatus(e.target.value as DivisionStatus)}>
                  <option value="open">{tr("Ouverte aux pronostics", "Open for predictions")}</option>
                  <option value="review">{tr("En contrôle (cachée aux joueurs)", "In review (hidden from players)")}</option>
                </select>
              </label>
              {day && <p className="muted small">{formatDay(day)} · {tr(`verrouillage à ${time}, heure du lieu. Les pronostics seront refusés par le serveur après cette heure.`, `lock at ${time}, venue time. The server will refuse predictions after this time.`)}</p>}
              {lockInPast && <p className="error">{tr("Cette heure est déjà passée : la division serait verrouillée tout de suite.", "This time has already passed: the division would be locked right away.")}</p>}
              {message && <p className={message.tone} role="status">{message.text}</p>}
            </div>
            <div className="sheet-actions">
              {done ? (
                <Link to={`/admin/competitions/${cid}`} className="button primary">{tr("Voir la compétition", "View competition")}</Link>
              ) : (
                <button className="primary" disabled={busy || !lockAt} onClick={publish}>{busy ? tr("Publication…", "Publishing…") : tr("Publier", "Publish")}</button>
              )}
              <button onClick={() => setOpen(false)} disabled={busy}>{tr("Fermer", "Close")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
