// Affichage des dates, heures et points, en français, dans le fuseau du lieu de compétition.

export function formatDay(day: string, options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }) {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { ...options, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatDates(start: string, end: string) {
  if (start === end) return formatDay(start, { day: "numeric", month: "long", year: "numeric" });
  return `${formatDay(start, { day: "numeric", month: "short" })} – ${formatDay(end, { day: "numeric", month: "short", year: "numeric" })}`;
}

/** Heure au lieu de compétition, ex. « 09:00 (heure de Riyad) ». */
export function formatLocalTime(date: Date, timeZone: string) {
  const time = new Intl.DateTimeFormat("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" }).format(date);
  return `${time} (heure de ${timeZone.split("/").pop()!.replace(/_/g, " ")})`;
}

export function localDayAndTime(date: Date, timeZone: string): { day: string; time: string } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** « dans 2 h 14 min », « dans 3 j », « dans 45 s ». */
export function formatCountdown(ms: number) {
  if (ms <= 0) return "maintenant";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return `dans ${Math.ceil(ms / 1000)} s`;
  if (minutes < 60) return `dans ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `dans ${hours} h ${String(minutes % 60).padStart(2, "0")} min`;
  return `dans ${Math.floor(hours / 24)} j`;
}

export const formatPoints = (points: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(points);

export const errorMessage = (error: unknown) => {
  const code = (error as { code?: string })?.code ?? "";
  if (code === "permission-denied") return "Action refusée par le serveur : division verrouillée, ou session expirée (reconnecte-toi).";
  if (code === "unavailable") return "Connexion impossible. Vérifie ton réseau et réessaie.";
  return error instanceof Error ? error.message : String(error);
};
