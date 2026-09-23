// Icônes au trait (SVG inline, 24 × 24), dessinées pour l'app : pas de SF Symbols ni de marque Apple.
import type { SVGProps } from "react";

const Icon = ({ children, ...props }: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>
);

/** Compétitions : un arbre de tirage. */
export const BracketIcon = () => (
  <Icon><path d="M3 5h5v4H3zM3 15h5v4H3zM8 7h3v10H8M11 12h4M15 10h6v4h-6z" /></Icon>
);
/** Classement : un podium. */
export const PodiumIcon = () => (
  <Icon><path d="M9 20V8h6v12M3 20v-7h6M15 20v-9h6v9M2 20h20" /><path d="M12 3.5l.8 1.6 1.7.2-1.2 1.2.3 1.7-1.6-.8-1.6.8.3-1.7-1.2-1.2 1.7-.2z" /></Icon>
);
/** Administration : un bouclier. */
export const ShieldIcon = () => (
  <Icon><path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" /></Icon>
);
/** Compte : une personne. */
export const PersonIcon = () => (
  <Icon><circle cx="12" cy="8" r="4" /><path d="M4 21c1.2-4 4.3-6 8-6s6.8 2 8 6" /></Icon>
);
export const ChevronIcon = () => (
  <Icon width="16" height="16" strokeWidth={2.2}><path d="M9 6l6 6-6 6" /></Icon>
);
