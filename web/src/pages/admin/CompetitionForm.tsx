import { useState, type FormEvent } from "react";
import type { CompetitionDoc } from "../../../../src/model.ts";
import { errorMessage } from "../../format.ts";

const COMMON_ZONES = ["Europe/Paris", "Europe/Madrid", "Europe/Rome", "Europe/Berlin", "Europe/London", "Europe/Istanbul",
  "Asia/Riyadh", "Asia/Dubai", "Asia/Qatar", "Asia/Amman", "Asia/Tehran", "Africa/Cairo", "Africa/Casablanca", "Africa/Tunis",
  "Asia/Seoul", "Asia/Tokyo", "Asia/Shanghai", "Asia/Taipei", "Asia/Bangkok", "America/New_York", "America/Mexico_City",
  "America/Sao_Paulo", "Australia/Sydney", "UTC"];

const validZone = (zone: string) => {
  try { new Intl.DateTimeFormat("fr-FR", { timeZone: zone }); return zone.length > 0; } catch { return false; }
};

export const blankCompetition = (): CompetitionDoc => {
  const today = new Date().toISOString().slice(0, 10);
  return { name: "", location: "", timezone: "Europe/Paris", startDate: today, endDate: today, published: false };
};

export function CompetitionForm({ initial, submitLabel, onSubmit }: {
  initial: CompetitionDoc; submitLabel: string; onSubmit: (data: CompetitionDoc) => Promise<void>;
}) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const set = <K extends keyof CompetitionDoc>(key: K, value: CompetitionDoc[K]) => { setData({ ...data, [key]: value }); setMessage(null); };
  const problems = [
    !data.name.trim() && "Nom obligatoire.",
    !validZone(data.timezone) && "Fuseau horaire inconnu (ex. Asia/Riyadh).",
    data.endDate < data.startDate && "La fin est avant le début.",
  ].filter(Boolean) as string[];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (problems.length) return;
    setBusy(true);
    try {
      await onSubmit({ ...data, name: data.name.trim(), location: data.location.trim() });
      setMessage({ tone: "ok", text: "Enregistré." });
    } catch (cause) {
      setMessage({ tone: "error", text: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>Nom<input value={data.name} placeholder="ex. Grand Prix de Riyad 2026" onChange={(e) => set("name", e.target.value)} /></label>
      <label>Lieu<input value={data.location} placeholder="ville, pays" onChange={(e) => set("location", e.target.value)} /></label>
      <label>Fuseau horaire du lieu (heure de verrouillage)
        <input list="zones" value={data.timezone} onChange={(e) => set("timezone", e.target.value.trim())} />
      </label>
      <datalist id="zones">{COMMON_ZONES.map((zone) => <option key={zone} value={zone} />)}</datalist>
      <div className="row">
        <label>Début<input type="date" value={data.startDate} onChange={(e) => set("startDate", e.target.value)} /></label>
        <label>Fin<input type="date" value={data.endDate} onChange={(e) => set("endDate", e.target.value)} /></label>
      </div>
      <label className="check"><input type="checkbox" checked={data.published} onChange={(e) => set("published", e.target.checked)} />
        Publiée : visible par tous (les divisions restent cachées tant qu'elles ne sont pas ouvertes)</label>
      {problems.length > 0 && <ul className="issues">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      {message && <p className={message.tone} role="status">{message.text}</p>}
      <button className="primary" disabled={busy || problems.length > 0}>{submitLabel}</button>
    </form>
  );
}
