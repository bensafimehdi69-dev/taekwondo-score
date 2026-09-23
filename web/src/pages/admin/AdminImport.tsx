import { useState } from "react";
import { divisionDoc, zonedTimeToUtc, type DivisionStatus } from "../../../../src/model.ts";
import { ControlScreen } from "../../control/ControlScreen.tsx";
import type { Session } from "../../control/control.ts";
import { getCompetition, publishDivisions, type WithId } from "../../data.ts";
import { adminError, formatDay } from "../../format.ts";
import { Link } from "../../router.tsx";
import { useAsync } from "../../useAsync.ts";
import type { CompetitionDoc } from "../../../../src/model.ts";

/** Import d'un PDF de tirage dans une compétition : contrôle, puis publication des divisions validées. */
export function AdminImportPage({ cid }: { cid: string }) {
  const { data: competition } = useAsync(() => getCompetition(cid), [cid]);
  return (
    <ControlScreen publish={{
      back: <Link to={`/admin/competitions/${cid}`} className="brand">← {competition?.name ?? "Compétition"}</Link>,
      render: (session) => competition ? <PublishButton cid={cid} competition={competition} session={session} /> : null,
    }} />
  );
}

function PublishButton({ cid, competition, session }: { cid: string; competition: WithId<CompetitionDoc>; session: Session }) {
  const validated = session.entries.filter((e) => e.validated);
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(competition.startDate);
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
        count("created") && `${count("created")} nouvelle(s)`,
        count("corrected") && `${count("corrected")} corrigée(s) : nouvelle version, les joueurs concernés devront vérifier leur pronostic`,
        count("unchanged") && `${count("unchanged")} déjà publiée(s) à l'identique : jour, heure et statut mis à jour, pronostics conservés`,
      ].filter(Boolean);
      setMessage({ tone: "ok", text: `Publication réussie. ${parts.join(" ; ")}.` });
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
        title={validated.length ? undefined : "Valide d'abord au moins une division."}>
        Publier<span className="hide-narrow"> ({validated.length})</span>
      </button>
      {open && (
        <div className="sheet-backdrop" onClick={() => !busy && setOpen(false)}>
          <div className="sheet" role="dialog" aria-label="Publier les divisions validées" onClick={(e) => e.stopPropagation()}>
            <p className="sheet-title">Publier {validated.length} division(s) validée(s)</p>
            <div className="form">
              <label>Jour de compétition<input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></label>
              <label>Heure de verrouillage (heure de {competition.timezone})
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </label>
              <label>Statut
                <select value={status} onChange={(e) => setStatus(e.target.value as DivisionStatus)}>
                  <option value="open">Ouverte aux pronostics</option>
                  <option value="review">En contrôle (cachée aux joueurs)</option>
                </select>
              </label>
              {day && <p className="muted small">{formatDay(day)} · verrouillage à {time}, heure du lieu. Les pronostics seront refusés par le serveur après cette heure.</p>}
              {lockInPast && <p className="error">Cette heure est déjà passée : la division serait verrouillée tout de suite.</p>}
              {message && <p className={message.tone} role="status">{message.text}</p>}
            </div>
            <div className="sheet-actions">
              {done ? (
                <Link to={`/admin/competitions/${cid}`} className="button primary">Voir la compétition</Link>
              ) : (
                <button className="primary" disabled={busy || !lockAt} onClick={publish}>{busy ? "Publication…" : "Publier"}</button>
              )}
              <button onClick={() => setOpen(false)} disabled={busy}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
