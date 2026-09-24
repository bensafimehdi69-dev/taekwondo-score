// Message à afficher sur la page suivante après une action (ex. « divisions publiées »), gardé le temps de la navigation.
const KEY = "tkd:message";

export function setFlash(text: string) {
  try { sessionStorage.setItem(KEY, text); } catch { /* message perdu : l'action a quand même réussi */ }
}

/** Lit le message une seule fois, puis l'efface. */
export function takeFlash(): string | null {
  try {
    const text = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return text;
  } catch { return null; }
}
