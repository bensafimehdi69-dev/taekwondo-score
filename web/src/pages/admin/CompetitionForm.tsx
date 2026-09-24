import { useState, type FormEvent } from "react";
import type { CompetitionDoc } from "../../../../src/model.ts";
import { errorMessage } from "../../format.ts";
import { tr } from "../../i18n.tsx";

// Villes où se tiennent souvent les compétitions, par région ; la valeur enregistrée reste le fuseau IANA.
// Libellés calculés à l'affichage, dans la langue courante.
const zoneGroups = (): Array<{ region: string; zones: Array<[string, string]> }> => [
  { region: tr("Europe", "Europe"), zones: [
    ["Europe/Paris", tr("Paris (France)", "Paris (France)")], ["Europe/Brussels", tr("Bruxelles (Belgique)", "Brussels (Belgium)")], ["Europe/Amsterdam", tr("Amsterdam (Pays-Bas)", "Amsterdam (Netherlands)")],
    ["Europe/Berlin", tr("Berlin (Allemagne)", "Berlin (Germany)")], ["Europe/Madrid", tr("Madrid (Espagne)", "Madrid (Spain)")], ["Europe/Rome", tr("Rome (Italie)", "Rome (Italy)")],
    ["Europe/Zurich", tr("Zurich (Suisse)", "Zurich (Switzerland)")], ["Europe/Vienna", tr("Vienne (Autriche)", "Vienna (Austria)")], ["Europe/Lisbon", tr("Lisbonne (Portugal)", "Lisbon (Portugal)")],
    ["Europe/London", tr("Londres (Royaume-Uni)", "London (United Kingdom)")], ["Europe/Dublin", tr("Dublin (Irlande)", "Dublin (Ireland)")], ["Europe/Warsaw", tr("Varsovie (Pologne)", "Warsaw (Poland)")],
    ["Europe/Zagreb", tr("Zagreb (Croatie)", "Zagreb (Croatia)")], ["Europe/Belgrade", tr("Belgrade (Serbie)", "Belgrade (Serbia)")], ["Europe/Sarajevo", tr("Sarajevo (Bosnie)", "Sarajevo (Bosnia)")],
    ["Europe/Sofia", tr("Sofia (Bulgarie)", "Sofia (Bulgaria)")], ["Europe/Bucharest", tr("Bucarest (Roumanie)", "Bucharest (Romania)")], ["Europe/Athens", tr("Athènes (Grèce)", "Athens (Greece)")],
    ["Europe/Helsinki", tr("Helsinki (Finlande)", "Helsinki (Finland)")], ["Europe/Stockholm", tr("Stockholm (Suède)", "Stockholm (Sweden)")], ["Europe/Oslo", tr("Oslo (Norvège)", "Oslo (Norway)")],
    ["Europe/Copenhagen", tr("Copenhague (Danemark)", "Copenhagen (Denmark)")], ["Europe/Istanbul", tr("Istanbul (Turquie)", "Istanbul (Türkiye)")], ["Europe/Moscow", tr("Moscou (Russie)", "Moscow (Russia)")],
  ] },
  { region: tr("Afrique", "Africa"), zones: [
    ["Africa/Casablanca", tr("Casablanca (Maroc)", "Casablanca (Morocco)")], ["Africa/Algiers", tr("Alger (Algérie)", "Algiers (Algeria)")], ["Africa/Tunis", tr("Tunis (Tunisie)", "Tunis (Tunisia)")],
    ["Africa/Cairo", tr("Le Caire (Égypte)", "Cairo (Egypt)")], ["Africa/Dakar", tr("Dakar (Sénégal)", "Dakar (Senegal)")], ["Africa/Abidjan", tr("Abidjan (Côte d'Ivoire)", "Abidjan (Côte d'Ivoire)")],
    ["Africa/Lagos", tr("Lagos (Nigeria)", "Lagos (Nigeria)")], ["Africa/Kinshasa", tr("Kinshasa (RD Congo)", "Kinshasa (DR Congo)")], ["Africa/Nairobi", tr("Nairobi (Kenya)", "Nairobi (Kenya)")],
    ["Africa/Johannesburg", tr("Johannesburg (Afrique du Sud)", "Johannesburg (South Africa)")],
  ] },
  { region: tr("Moyen-Orient", "Middle East"), zones: [
    ["Asia/Amman", tr("Amman (Jordanie)", "Amman (Jordan)")], ["Asia/Beirut", tr("Beyrouth (Liban)", "Beirut (Lebanon)")], ["Asia/Riyadh", tr("Riyad (Arabie saoudite)", "Riyadh (Saudi Arabia)")],
    ["Asia/Qatar", tr("Doha (Qatar)", "Doha (Qatar)")], ["Asia/Bahrain", tr("Manama (Bahreïn)", "Manama (Bahrain)")], ["Asia/Kuwait", tr("Koweït", "Kuwait")], ["Asia/Dubai", tr("Dubaï, Fujairah (Émirats)", "Dubai, Fujairah (UAE)")],
    ["Asia/Muscat", tr("Mascate (Oman)", "Muscat (Oman)")], ["Asia/Tehran", tr("Téhéran (Iran)", "Tehran (Iran)")], ["Asia/Baku", tr("Bakou (Azerbaïdjan)", "Baku (Azerbaijan)")],
  ] },
  { region: tr("Asie et Océanie", "Asia and Oceania"), zones: [
    ["Asia/Tashkent", tr("Tachkent (Ouzbékistan)", "Tashkent (Uzbekistan)")], ["Asia/Almaty", tr("Almaty (Kazakhstan)", "Almaty (Kazakhstan)")], ["Asia/Kolkata", tr("New Delhi (Inde)", "New Delhi (India)")],
    ["Asia/Bangkok", tr("Bangkok (Thaïlande)", "Bangkok (Thailand)")], ["Asia/Ho_Chi_Minh", tr("Hô Chi Minh-Ville (Viêt Nam)", "Ho Chi Minh City (Vietnam)")], ["Asia/Jakarta", tr("Jakarta (Indonésie)", "Jakarta (Indonesia)")],
    ["Asia/Manila", tr("Manille (Philippines)", "Manila (Philippines)")], ["Asia/Shanghai", tr("Pékin, Taiyuan, Wuxi (Chine)", "Beijing, Taiyuan, Wuxi (China)")], ["Asia/Taipei", tr("Taipei (Taïwan)", "Taipei (Taiwan)")],
    ["Asia/Seoul", tr("Séoul, Muju (Corée du Sud)", "Seoul, Muju (South Korea)")], ["Asia/Tokyo", tr("Tokyo (Japon)", "Tokyo (Japan)")], ["Australia/Sydney", tr("Sydney (Australie)", "Sydney (Australia)")],
    ["Pacific/Auckland", tr("Auckland (Nouvelle-Zélande)", "Auckland (New Zealand)")],
  ] },
  { region: tr("Amériques", "Americas"), zones: [
    ["America/Montreal", tr("Montréal (Canada)", "Montreal (Canada)")], ["America/New_York", tr("New York (États-Unis, côte Est)", "New York (USA, East Coast)")],
    ["America/Chicago", tr("Chicago, Dallas (États-Unis, centre)", "Chicago, Dallas (USA, Central)")], ["America/Denver", tr("Denver (États-Unis, montagnes)", "Denver (USA, Mountain)")],
    ["America/Los_Angeles", tr("Los Angeles (États-Unis, côte Ouest)", "Los Angeles (USA, West Coast)")], ["America/Mexico_City", tr("Mexico (Mexique)", "Mexico City (Mexico)")],
    ["America/Bogota", tr("Bogota (Colombie)", "Bogotá (Colombia)")], ["America/Lima", tr("Lima (Pérou)", "Lima (Peru)")], ["America/Santiago", tr("Santiago (Chili)", "Santiago (Chile)")],
    ["America/Argentina/Buenos_Aires", tr("Buenos Aires (Argentine)", "Buenos Aires (Argentina)")], ["America/Sao_Paulo", tr("São Paulo, Rio (Brésil)", "São Paulo, Rio (Brazil)")],
    ["America/Puerto_Rico", tr("San Juan (Porto Rico)", "San Juan (Puerto Rico)")],
  ] },
];
const LISTED = new Set(zoneGroups().flatMap((g) => g.zones.map(([zone]) => zone)));

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
      {zoneGroups().map((group) => (
        <optgroup key={group.region} label={group.region}>
          {group.zones.map(([zone, label]) => <option key={zone} value={zone}>{label} · {offsetAt(zone, day)}</option>)}
        </optgroup>
      ))}
      {others.length > 0 && (
        <optgroup label={tr("Autres fuseaux", "Other time zones")}>
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
    !data.name.trim() && tr("Nom obligatoire.", "Name required."),
    !validZone(data.timezone) && tr("Fuseau horaire inconnu : choisis-le dans la liste.", "Unknown time zone: pick one from the list."),
    data.endDate < data.startDate && tr("La fin est avant le début.", "The end is before the start."),
  ].filter(Boolean) as string[];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (problems.length) return;
    setBusy(true);
    try {
      await onSubmit({ ...data, name: data.name.trim(), location: data.location.trim() });
      setMessage({ tone: "ok", text: tr("Enregistré.", "Saved.") });
    } catch (cause) {
      setMessage({ tone: "error", text: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>{tr("Nom", "Name")}<input value={data.name} placeholder={tr("ex. Grand Prix de Riyad 2026", "e.g. Riyadh Grand Prix 2026")} onChange={(e) => set("name", e.target.value)} /></label>
      <label>{tr("Lieu", "Location")}<input value={data.location} placeholder={tr("ville, pays", "city, country")} onChange={(e) => set("location", e.target.value)} /></label>
      <label>{tr("Fuseau horaire du lieu (heure de verrouillage)", "Venue time zone (lock time)")}
        <TimezoneSelect value={data.timezone} day={data.startDate} onChange={(zone) => set("timezone", zone)} />
      </label>
      <div className="row">
        <label>{tr("Début", "Start")}<input type="date" value={data.startDate} onChange={(e) => set("startDate", e.target.value)} /></label>
        <label>{tr("Fin", "End")}<input type="date" value={data.endDate} onChange={(e) => set("endDate", e.target.value)} /></label>
      </div>
      <label className="check"><input type="checkbox" checked={data.published} onChange={(e) => set("published", e.target.checked)} />
        {tr("Publiée : visible par tous (les divisions restent cachées tant qu'elles ne sont pas ouvertes)", "Published: visible to everyone (divisions stay hidden until they are open)")}</label>
      {problems.length > 0 && <ul className="issues">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      {message && <p className={message.tone} role="status">{message.text}</p>}
      <button className="primary" disabled={busy || problems.length > 0}>{submitLabel}</button>
    </form>
  );
}
