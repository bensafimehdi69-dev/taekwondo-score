// Affichage des dates, heures et points dans la langue choisie, dans le fuseau du lieu de compétition.
import { locale, tr } from "./i18n-core.ts";

export function formatDay(day: string, options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }) {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat(locale(), { ...options, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatDates(start: string, end: string) {
  if (start === end) return formatDay(start, { day: "numeric", month: "long", year: "numeric" });
  return `${formatDay(start, { day: "numeric", month: "short" })} – ${formatDay(end, { day: "numeric", month: "short", year: "numeric" })}`;
}

/** Heure au lieu de compétition, ex. « 09:00 (heure de Riyad) », « 09:00 (Riyadh time) ». */
export function formatLocalTime(date: Date, timeZone: string) {
  const time = new Intl.DateTimeFormat(locale(), { timeZone, hour: "2-digit", minute: "2-digit" }).format(date);
  const city = timeZone.split("/").pop()!.replace(/_/g, " ");
  return tr(`${time} (heure de ${city})`, `${time} (${city} time)`);
}

export function localDayAndTime(date: Date, timeZone: string): { day: string; time: string } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** « dans 2 h 14 min » / « in 2 h 14 min », « dans 3 j » / « in 3 d ». */
export function formatCountdown(ms: number) {
  if (ms <= 0) return tr("maintenant", "now");
  const minutes = Math.floor(ms / 60_000);
  const inText = (text: string) => tr(`dans ${text}`, `in ${text}`);
  if (minutes < 1) return inText(`${Math.ceil(ms / 1000)} s`);
  if (minutes < 60) return inText(`${minutes} min`);
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return inText(`${hours} h ${String(minutes % 60).padStart(2, "0")} min`);
  return inText(`${Math.floor(hours / 24)} ${tr("j", "d")}`);
}

export const formatPoints = (points: number) => new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(points);

/** Erreur d'une action d'administration : un refus du serveur vient des droits, pas d'un verrouillage. */
export const adminError = (error: unknown) => (error as { code?: string })?.code === "permission-denied"
  ? tr("Action refusée par le serveur : ta session d'administrateur n'est pas reconnue. Déconnecte-toi, reconnecte-toi, puis réessaie.",
    "Action refused by the server: your admin session is not recognised. Sign out, sign back in, then try again.")
  : errorMessage(error);

export const errorMessage = (error: unknown) => {
  const code = (error as { code?: string })?.code ?? "";
  if (code === "permission-denied") return tr("Action refusée par le serveur : division verrouillée, ou session expirée (reconnecte-toi).",
    "Action refused by the server: the division is locked, or your session expired (sign in again).");
  if (code === "unavailable") return tr("Connexion impossible. Vérifie ton réseau et réessaie.", "Cannot connect. Check your network and try again.");
  return error instanceof Error ? error.message : String(error);
};
