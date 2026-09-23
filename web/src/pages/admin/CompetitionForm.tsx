import { useState, type FormEvent } from "react";
import type { CompetitionDoc } from "../../../../src/model.ts";
import { errorMessage } from "../../format.ts";

// Villes où se tiennent souvent les compétitions, par région ; la valeur enregistrée reste le fuseau IANA.
const ZONE_GROUPS: Array<{ region: string; zones: Array<[string, string]> }> = [
  { region: "Europe", zones: [
    ["Europe/Paris", "Paris (France)"], ["Europe/Brussels", "Bruxelles (Belgique)"], ["Europe/Amsterdam", "Amsterdam (Pays-Bas)"],
    ["Europe/Berlin", "Berlin (Allemagne)"], ["Europe/Madrid", "Madrid (Espagne)"], ["Europe/Rome", "Rome (Italie)"],
    ["Europe/Zurich", "Zurich (Suisse)"], ["Europe/Vienna", "Vienne (Autriche)"], ["Europe/Lisbon", "Lisbonne (Portugal)"],
    ["Europe/London", "Londres (Royaume-Uni)"], ["Europe/Dublin", "Dublin (Irlande)"], ["Europe/Warsaw", "Varsovie (Pologne)"],
    ["Europe/Zagreb", "Zagreb (Croatie)"], ["Europe/Belgrade", "Belgrade (Serbie)"], ["Europe/Sarajevo", "Sarajevo (Bosnie)"],
    ["Europe/Sofia", "Sofia (Bulgarie)"], ["Europe/Bucharest", "Bucarest (Roumanie)"], ["Europe/Athens", "Athènes (Grèce)"],
    ["Europe/Helsinki", "Helsinki (Finlande)"], ["Europe/Stockholm", "Stockholm (Suède)"], ["Europe/Oslo", "Oslo (Norvège)"],
    ["Europe/Copenhagen", "Copenhague (Danemark)"], ["Europe/Istanbul", "Istanbul (Turquie)"], ["Europe/Moscow", "Moscou (Russie)"],
  ] },
  { region: "Afrique", zones: [
    ["Africa/Casablanca", "Casablanca (Maroc)"], ["Africa/Algiers", "Alger (Algérie)"], ["Africa/Tunis", "Tunis (Tunisie)"],
    ["Africa/Cairo", "Le Caire (Égypte)"], ["Africa/Dakar", "Dakar (Sénégal)"], ["Africa/Abidjan", "Abidjan (Côte d'Ivoire)"],
    ["Africa/Lagos", "Lagos (Nigeria)"], ["Africa/Kinshasa", "Kinshasa (RD Congo)"], ["Africa/Nairobi", "Nairobi (Kenya)"],
    ["Africa/Johannesburg", "Johannesburg (Afrique du Sud)"],
  ] },
  { region: "Moyen-Orient", zones: [
    ["Asia/Amman", "Amman (Jordanie)"], ["Asia/Beirut", "Beyrouth (Liban)"], ["Asia/Riyadh", "Riyad (Arabie saoudite)"],
    ["Asia/Qatar", "Doha (Qatar)"], ["Asia/Bahrain", "Manama (Bahreïn)"], ["Asia/Kuwait", "Koweït"], ["Asia/Dubai", "Dubaï, Fujairah (Émirats)"],
    ["Asia/Muscat", "Mascate (Oman)"], ["Asia/Tehran", "Téhéran (Iran)"], ["Asia/Baku", "Bakou (Azerbaïdjan)"],
  ] },
  { region: "Asie et Océanie", zones: [
    ["Asia/Tashkent", "Tachkent (Ouzbékistan)"], ["Asia/Almaty", "Almaty (Kazakhstan)"], ["Asia/Kolkata", "New Delhi (Inde)"],
    ["Asia/Bangkok", "Bangkok (Thaïlande)"], ["Asia/Ho_Chi_Minh", "Hô Chi Minh-Ville (Viêt Nam)"], ["Asia/Jakarta", "Jakarta (Indonésie)"],
    ["Asia/Manila", "Manille (Philippines)"], ["Asia/Shanghai", "Pékin, Taiyuan, Wuxi (Chine)"], ["Asia/Taipei", "Taipei (Taïwan)"],
    ["Asia/Seoul", "Séoul, Muju (Corée du Sud)"], ["Asia/Tokyo", "Tokyo (Japon)"], ["Australia/Sydney", "Sydney (Australie)"],
    ["Pacific/Auckland", "Auckland (Nouvelle-Zélande)"],
  ] },
  { region: "Amériques", zones: [
    ["America/Montreal", "Montréal (Canada)"], ["America/New_York", "New York (États-Unis, côte Est)"],
    ["America/Chicago", "Chicago, Dallas (États-Unis, centre)"], ["America/Denver", "Denver (États-Unis, montagnes)"],
    ["America/Los_Angeles", "Los Angeles (États-Unis, côte Ouest)"], ["America/Mexico_City", "Mexico (Mexique)"],
    ["America/Bogota", "Bogota (Colombie)"], ["America/Lima", "Lima (Pérou)"], ["America/Santiago", "Santiago (Chili)"],
    ["America/Argentina/Buenos_Aires", "Buenos Aires (Argentine)"], ["America/Sao_Paulo", "São Paulo, Rio (Brésil)"],
    ["America/Puerto_Rico", "San Juan (Porto Rico)"],
  ] },
];
const LISTED = new Set(ZONE_GROUPS.flatMap((g) => g.zones.map(([zone]) => zone)));

const validZone = (zone: string) => {
  try { new Intl.DateTimeFormat("fr-FR", { timeZone: zone }); return zone.length > 0; } catch { return false; }
};

/** Décalage du fuseau à une date donnée (heure d'été comprise), « UTC+2 ». */
function offsetAt(zone: string, day: string): string {
  try {
    const date = new Date(`${day || new Date().toISOString().slice(0, 10)}T12:00:00Z`);
    const part = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(date).find((p) => p.type === "timeZoneName")?.value ?? "";
    return part.replace("GMT", "UTC").replace(/^UTC$/, "UTC+0");
  } catch { return ""; }
}

/** Tous les autres fuseaux connus du navigateur, pour les lieux absents de la liste. */
const otherZones = (): string[] => {
  const all = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  return all.filter((zone) => !LISTED.has(zone));
};

function TimezoneSelect({ value, day, onChange }: { value: string; day: string; onChange: (zone: string) => void }) {
  const others = otherZones();
  const unknown = value && !LISTED.has(value) && !others.includes(value);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {unknown && <option value={value}>{value}</option>}
      {ZONE_GROUPS.map((group) => (
        <optgroup key={group.region} label={group.region}>
          {group.zones.map(([zone, label]) => <option key={zone} value={zone}>{label} · {offsetAt(zone, day)}</option>)}
        </optgroup>
      ))}
      {others.length > 0 && (
        <optgroup label="Autres fuseaux">
          {others.map((zone) => <option key={zone} value={zone}>{zone.replace(/_/g, " ")} · {offsetAt(zone, day)}</option>)}
        </optgroup>
      )}
    </select>
  );
}

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
    !validZone(data.timezone) && "Fuseau horaire inconnu : choisis-le dans la liste.",
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
        <TimezoneSelect value={data.timezone} day={data.startDate} onChange={(zone) => set("timezone", zone)} />
      </label>
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
