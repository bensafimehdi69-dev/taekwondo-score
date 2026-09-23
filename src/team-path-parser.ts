import type { ParsedPage, VisualTextItem } from "./types.ts";

export type FightCode = {
  code: string;
  area: number;
  order: number;
  x: number;
  y: number;
  page: number;
};

export type TeamAthlete = {
  id: string;
  name: string;
  team: string;
  category: string;
  ageCategory: string;
  genderCategory: string;
  weightCategory: string;
  page: number;
  side: "left" | "right";
  startFight?: string;
  path: string[];
  confidence: number;
  warnings: string[];
  sourceText: string;
  country?: string;
  affiliation?: string;
  drawFormat?: "taekoplan" | "wt" | "unknown";
  sourceBounds?: { x: number; y: number; width: number; height: number };
  /** Numéro de tête de série imprimé devant le nom, ex. « (1) NOM KOR ». Absent si non tête de série ou non imprimé. */
  seed?: number;
};

export type TeamDrawAnalysis = {
  athletes: TeamAthlete[];
  pageCount: number;
  ocrPageCount: number;
  warnings: string[];
};

/** Lit « (1) NOM » ; « (x) » ou « (X) » signifie non tête de série. */
export function parseSeed(sourceText: string): number | undefined {
  const match = sourceText.replace(/\u00a0/g, " ").match(/^\s*\((\d{1,3})\)/);
  if (!match) return undefined;
  const seed = Number(match[1]);
  return seed >= 1 ? seed : undefined;
}

const tidy = (value: string) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

export const normalizeDrawText = (value: string) => tidy(value).normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().toUpperCase();

const normalized = normalizeDrawText;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function containsNormalizedPhrase(value: string, phrase: string): boolean {
  const haystack = normalized(value);
  const needle = normalized(phrase);
  if (!needle) return false;
  return new RegExp(`(?:^| )${escapeRegExp(needle)}(?: |$)`).test(haystack);
}

export function decodeFightCode(code: string): { area: number; order: number } | null {
  if (!/^[1-9]\d{2}$/.test(code)) return null;
  return { area: Number(code[0]), order: Number(code.slice(1)) };
}

export function chronologicalFightSort(a: Pick<FightCode, "area" | "order">, b: Pick<FightCode, "area" | "order">) {
  return a.order - b.order || a.area - b.area;
}

export function bracketRoundLabel(pathLength: number, pathIndex: number): string {
  const roundsAfter = Math.max(0, pathLength - pathIndex - 1);
  if (roundsAfter === 0) return "Final";
  if (roundsAfter === 1) return "Semi-final";
  if (roundsAfter === 2) return "Quarter-final";
  return `Round of ${2 ** (roundsAfter + 1)}`;
}

const COUNTRY_NAME_CODES: Record<string, string> = {
  ALG: "DZ", ALGERIA: "DZ", ARG: "AR", ARGENTINA: "AR", ARM: "AM", ARMENIA: "AM",
  AUS: "AU", AUSTRALIA: "AU", AUT: "AT", AUSTRIA: "AT", AZE: "AZ", AZERBAIJAN: "AZ",
  BEL: "BE", BELGIUM: "BE", BHR: "BH", BAHRAIN: "BH", BIH: "BA", BOSNIA: "BA",
  BRA: "BR", BRAZIL: "BR", BUL: "BG", BULGARIA: "BG", CAN: "CA", CANADA: "CA",
  CHI: "CL", CHILE: "CL", CHN: "CN", CHINA: "CN", CIV: "CI", COL: "CO", COLOMBIA: "CO",
  CRO: "HR", CROATIA: "HR", CUB: "CU", CUBA: "CU", CZE: "CZ", CZECHIA: "CZ",
  DEN: "DK", DENMARK: "DK", DOM: "DO", ECU: "EC", ECUADOR: "EC", EGY: "EG", EGYPT: "EG",
  ESP: "ES", SPAIN: "ES", ETH: "ET", ETHIOPIA: "ET", FIN: "FI", FINLAND: "FI",
  FRA: "FR", FRANCE: "FR", GBR: "GB", "UNITED KINGDOM": "GB", UK: "GB", GEO: "GE", GEORGIA: "GE",
  GER: "DE", GERMANY: "DE", GHA: "GH", GHANA: "GH", GRE: "GR", GREECE: "GR",
  HUN: "HU", HUNGARY: "HU", INA: "ID", INDONESIA: "ID", IND: "IN", INDIA: "IN",
  IRI: "IR", IRAN: "IR", IRL: "IE", IRELAND: "IE", IRQ: "IQ", IRAQ: "IQ",
  ISR: "IL", ISRAEL: "IL", ITA: "IT", ITALY: "IT", JOR: "JO", JORDAN: "JO",
  JPN: "JP", JAPAN: "JP", KAZ: "KZ", KAZAKHSTAN: "KZ", KEN: "KE", KENYA: "KE",
  KGZ: "KG", KYRGYZSTAN: "KG", KOR: "KR", KOREA: "KR", "SOUTH KOREA": "KR",
  KSA: "SA", "SAUDI ARABIA": "SA", KUW: "KW", KUWAIT: "KW", LBN: "LB", LEBANON: "LB",
  MAR: "MA", MOROCCO: "MA", MAS: "MY", MALAYSIA: "MY", MDA: "MD", MOLDOVA: "MD",
  MEX: "MX", MEXICO: "MX", NED: "NL", NETHERLANDS: "NL", NGR: "NG", NIGERIA: "NG",
  NOR: "NO", NORWAY: "NO", NZL: "NZ", "NEW ZEALAND": "NZ", PAK: "PK", PAKISTAN: "PK",
  PER: "PE", PERU: "PE", PHI: "PH", PHILIPPINES: "PH", PLE: "PS", PALESTINE: "PS",
  POL: "PL", POLAND: "PL", POR: "PT", PORTUGAL: "PT", PUR: "PR", "PUERTO RICO": "PR",
  QAT: "QA", QATAR: "QA", ROU: "RO", ROMANIA: "RO", RSA: "ZA", "SOUTH AFRICA": "ZA",
  RUS: "RU", RUSSIA: "RU", SEN: "SN", SENEGAL: "SN", SGP: "SG", SINGAPORE: "SG",
  SLO: "SI", SLOVENIA: "SI", SRB: "RS", SERBIA: "RS", SUI: "CH", SWITZERLAND: "CH",
  SVK: "SK", SLOVAKIA: "SK", SWE: "SE", SWEDEN: "SE", SYR: "SY", SYRIA: "SY",
  THA: "TH", THAILAND: "TH", TJK: "TJ", TAJIKISTAN: "TJ", TKM: "TM", TURKMENISTAN: "TM",
  TUN: "TN", TUNISIA: "TN", TUR: "TR", TURKEY: "TR", UAE: "AE", "UNITED ARAB EMIRATES": "AE",
  UKR: "UA", UKRAINE: "UA", USA: "US", US: "US", "UNITED STATES": "US",
  UZB: "UZ", UZBEKISTAN: "UZ", VEN: "VE", VENEZUELA: "VE", VIE: "VN", VIETNAM: "VN",
};

export function extractMarkers(page: ParsedPage): FightCode[] {
  const markers: FightCode[] = [];
  for (const item of page.items) {
    const text = tidy(item.text);
    // Fight boxes contain only the code. Bibs, dates and result scores do not.
    if (!/^[1-9]\d{2}$/.test(text)) continue;
    const precedingBib = page.items.some((prefix) => /^[BR]\s*\/\s*$/i.test(tidy(prefix.text))
      && Math.abs(prefix.y - item.y) < 2 && prefix.x < item.x
      && item.x - (prefix.x + prefix.width) < 8);
    if (precedingBib) continue;
    const matches = [...text.matchAll(/([1-9]\d{2})/g)];
    for (const match of matches) {
      const decoded = decodeFightCode(match[1]);
      if (!decoded) continue;
      markers.push({
        code: match[1],
        ...decoded,
        x: item.x + item.width / 2,
        y: item.y + item.height / 2,
        page: page.pageNumber,
      });
    }
  }
  return markers.filter((marker, index) => !markers.some((other, otherIndex) =>
    otherIndex < index && other.code === marker.code && Math.abs(other.x - marker.x) < 3 && Math.abs(other.y - marker.y) < 3,
  ));
}

function rowItems(page: ParsedPage, anchor: VisualTextItem): VisualTextItem[] {
  const anchorCenter = anchor.y + anchor.height / 2;
  const side = anchor.x + anchor.width / 2 < page.width / 2 ? "left" : "right";
  return page.items
    .filter((item) => {
      const itemCenter = item.y + item.height / 2;
      const itemSide = item.x + item.width / 2 < page.width / 2 ? "left" : "right";
      return itemSide === side && Math.abs(itemCenter - anchorCenter) <= Math.max(4, anchor.height * 0.8);
    })
    .sort((a, b) => a.x - b.x);
}

function cleanAthleteName(rowText: string, team: string): string {
  let value = tidy(rowText)
    .replace(/\b[BR]\s*\/\s*\d+\b/gi, " ")
    .replace(/\b[BR]\s*\/\s*/gi, " ")
    .replace(team ? new RegExp(`(^|[\\s(])${escapeRegExp(team)}(?=$|[\\s)])`, "ig") : /$^/, " ")
    .replace(/\b(?:19|20)\d{2}\b/g, " ")
    .replace(/\b[1-9]\d{2}\b/g, " ")
    .replace(/^\s*(?:\d+|\([X\d]+\))[.)-]?\s*/i, " ")
    .replace(/\b(?:ROUND|QUARTER|SEMI(?:FINAL)?|FINAL|WINNER|WINNERS|FREE DRAW|BYE)\b/gi, " ")
    .replace(/[|,:;–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parenthesized = value.match(/^(.+?)\s*\([A-Z0-9 .'-]{2,}\)$/);
  if (parenthesized) value = parenthesized[1].trim();
  return value;
}

function looksLikeTeamOnlyName(value: string): boolean {
  const key = normalized(value);
  if (!key) return true;
  if (/\b(?:TEAM|CLUB|ACADEMY|FEDERATION|REGION|OBLYSY|QALASY)\b/.test(key)) return true;
  const tokens = key.split(" ").filter(Boolean);
  const organizationWords = new Set(["TEAM", "CLUB", "DOJO", "ACADEMY", "FEDERATION", "ASSOCIATION", "NATIONAL"]);
  return tokens.every((token) => organizationWords.has(token) || Boolean(COUNTRY_NAME_CODES[token]));
}

function likelyName(value: string): boolean {
  if (value.length < 3 || value.length > 90 || /^\d+$/.test(value)) return false;
  const words = value.match(/\p{L}[\p{L}'’\-]+/gu) ?? [];
  return words.length >= 1 && !/COMPETITION|CHAMPIONSHIP|CATEGORY|CLASSIFICATION|TAEKWONDO|DRAW SHEET|PRIZE WINNERS|RESULT LEGEND|FREE DRAW|\b(?:DSQ|PTF|WDR|RSC|DQB|GDP|PUN|SUP)\b/i.test(value);
}

function athleteNameAboveTeam(page: ParsedPage, teamItem: VisualTextItem, team: string) {
  const teamSide = teamItem.x + teamItem.width / 2 < page.width / 2 ? "left" : "right";
  const maxVerticalGap = Math.max(18, teamItem.height * 3.2);
  const candidates = page.items.flatMap((candidate) => {
    if (candidate === teamItem || candidate.y >= teamItem.y) return [];
    const candidateSide = candidate.x + candidate.width / 2 < page.width / 2 ? "left" : "right";
    if (candidateSide !== teamSide || teamItem.y - candidate.y > maxVerticalGap) return [];
    if (Math.abs(candidate.x - teamItem.x) > page.width * 0.18) return [];
    if (/^[BR]\s*\/\s*\d+$/i.test(tidy(candidate.text))) return [];
    const name = cleanAthleteName(candidate.text, team);
    if (!likelyName(name) || containsNormalizedPhrase(candidate.text, team)) return [];
    return [{ item: candidate, name, distance: teamItem.y - candidate.y }];
  });
  return candidates.sort((a, b) => a.distance - b.distance || b.name.length - a.name.length)[0];
}

type DivisionDetails = {
  ageCategory: string;
  genderCategory: string;
  weightCategory: string;
  category: string;
};

type ParsedDivision = DivisionDetails & {
  explicitAge?: string;
  genderKey?: "men" | "women";
  weightKey?: string;
  weightValue?: number;
  weightSign?: "+" | "-";
};

const divisionWeightSets = [
  { age: "Cadet", gender: "men", weights: ["-33", "-37", "-41", "-45", "-49", "-53", "-57", "-61", "-65", "+65"] },
  { age: "Junior", gender: "men", weights: ["-45", "-48", "-51", "-55", "-59", "-63", "-68", "-73", "-78", "+78"] },
  // Include Olympic/Grand Prix upper divisions alongside the usual divisions.
  { age: "Senior", gender: "men", weights: ["-54", "-58", "-63", "-68", "-74", "-80", "+80", "-87", "+87"] },
  { age: "Cadet", gender: "women", weights: ["-29", "-33", "-37", "-41", "-44", "-47", "-51", "-55", "-59", "+59"] },
  { age: "Junior", gender: "women", weights: ["-42", "-44", "-46", "-49", "-52", "-55", "-59", "-63", "-68", "+68"] },
  { age: "Senior", gender: "women", weights: ["-46", "-49", "-53", "-57", "-62", "-67", "+67", "-73", "+73"] },
] as const;

function parsedDivisionFor(page: ParsedPage): ParsedDivision {
  const visualHeader = [...page.items]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .slice(0, 160)
    .map((item) => item.text)
    .join(" ");
  const header = page.items.filter((item) => item.y < page.height * 0.18
    && item.x > page.width * 0.25 && item.x < page.width * 0.75).sort((a, b) => a.y - b.y || a.x - b.x).map((item) => item.text).join(" ");
  const source = tidy([header, page.rawText, page.orderedText.slice(0, 120).join(" "), visualHeader].join(" "));
  const explicitAgeMatch = source.match(/\b(SENIORS?|JUNIORS?|CADETS?|YOUTH|U\s*\d{1,2})\b/i);
  const divisionMatch = source.match(/\b(MEN|WOMEN|MALE|FEMALE|BOYS?|GIRLS?)\b(?:\s*-\s*[A-Z])?[^+\-\d]{0,20}([+-])\s*(\d+(?:[.,]\d+)?)(?:\s*KG\b|(?=\s+CONTESTANTS?\b))/i);
  const genderMatch = divisionMatch ?? source.match(/\b(MEN|WOMEN|MALE|FEMALE|BOYS?|GIRLS?)\b/i);
  const weightMatch = divisionMatch ?? source.match(/([+-])\s*(\d+(?:[.,]\d+)?)(?:\s*KG\b|(?=\s+CONTESTANTS?\b))/i);
  const genderToken = genderMatch?.[1]?.toUpperCase();
  const genderKey = genderToken === "MEN" || genderToken === "MALE" || genderToken === "BOY" || genderToken === "BOYS" ? "men"
    : genderToken === "WOMEN" || genderToken === "FEMALE" || genderToken === "GIRL" || genderToken === "GIRLS" ? "women"
      : undefined;
  const genderCategory = genderKey === "men" ? "Men" : genderKey === "women" ? "Women" : "Open";
  const sign = (divisionMatch?.[2] ?? weightMatch?.[1]) as "+" | "-" | undefined;
  const numericText = (divisionMatch?.[3] ?? weightMatch?.[2])?.replace(",", ".");
  const weightValue = numericText ? Number(numericText) : undefined;
  const weightKey = sign && Number.isFinite(weightValue) ? `${sign}${weightValue}` : undefined;
  const weightCategory = weightKey ? `${weightKey} kg` : "To confirm";
  const explicitAge = explicitAgeMatch
    ? tidy(explicitAgeMatch[1]).toLowerCase().replace(/s$/, "").replace(/^./, (letter) => letter.toUpperCase()).replace(/\s+/g, "")
    : undefined;
  const ageCategory = explicitAge ?? "To confirm";
  return {
    explicitAge,
    genderKey,
    genderCategory,
    weightKey,
    weightValue,
    weightSign: sign,
    weightCategory,
    ageCategory,
    category: `${ageCategory} · ${genderCategory} · ${weightCategory}`,
  };
}

function startsNewDivisionBlock(previous: ParsedDivision, current: ParsedDivision, direction: number): boolean {
  if (previous.genderKey !== current.genderKey) return true;
  if (previous.explicitAge && current.explicitAge && previous.explicitAge !== current.explicitAge) return true;
  if (previous.weightSign === "+" || current.weightSign === "+") return direction >= 0 && previous.weightSign === "+" && current.weightSign === "-";
  return previous.weightSign === "-" && current.weightSign === "-"
    && previous.weightValue !== undefined && current.weightValue !== undefined
    && direction !== 0 && Math.sign(current.weightValue - previous.weightValue) !== 0
    && Math.sign(current.weightValue - previous.weightValue) !== direction;
}

function divisionDetailsForPages(pages: ParsedPage[]): Map<number, DivisionDetails> {
  const parsed = pages.map((page) => ({ page, division: parsedDivisionFor(page) }));
  const result = new Map<number, DivisionDetails>();
  let block: typeof parsed = [];

  const flush = () => {
    if (!block.length) return;
    const explicit = block.map((entry) => entry.division.explicitAge).find(Boolean);
    const gender = block[0].division.genderKey;
    const definitions = divisionWeightSets.filter((definition) => definition.gender === gender);
    // All divisions must support the inferred age. A majority of repeated pages
    // must not turn a mixed junior/senior document into one age group.
    const compatible = definitions.filter((definition) => block.every((entry) =>
      entry.division.weightKey && (definition.weights as readonly string[]).includes(entry.division.weightKey)));
    const inferred = compatible.length === 1 ? compatible[0].age : undefined;
    for (const entry of block) {
      const division = entry.division;
      const uniqueForWeight = definitions.filter((definition) => division.weightKey
        && (definition.weights as readonly string[]).includes(division.weightKey));
      const ageCategory = division.explicitAge ?? explicit ?? inferred
        ?? (uniqueForWeight.length === 1 ? uniqueForWeight[0].age : "To confirm");
      result.set(entry.page.pageNumber, {
        ageCategory,
        genderCategory: division.genderCategory,
        weightCategory: division.weightCategory,
        category: `${ageCategory} · ${division.genderCategory} · ${division.weightCategory}`,
      });
    }
    block = [];
  };

  for (const entry of parsed) {
    if (!entry.division.genderKey || !entry.division.weightKey) {
      flush();
      result.set(entry.page.pageNumber, entry.division);
      continue;
    }
    const direction = block.length > 1 ? Math.sign((block[1].division.weightValue ?? 0) - (block[0].division.weightValue ?? 0)) : 0;
    const blockExplicitAge = block.find((item) => item.division.explicitAge)?.division.explicitAge;
    if (block.length && (startsNewDivisionBlock(block[block.length - 1].division, entry.division, direction)
      || (blockExplicitAge && entry.division.explicitAge && blockExplicitAge !== entry.division.explicitAge))) flush();
    block.push(entry);
  }
  flush();
  return result;
}

function clusterByDepth(markers: FightCode[], page: ParsedPage, side: "left" | "right") {
  const sameSide = markers
    .filter((marker) => side === "left" ? marker.x <= page.width * 0.54 : marker.x >= page.width * 0.46)
    .map((marker) => ({ marker, depth: side === "left" ? marker.x : page.width - marker.x }))
    .sort((a, b) => a.depth - b.depth);
  const tolerance = Math.max(8, page.width * 0.022);
  const clusters: Array<{ depth: number; markers: FightCode[] }> = [];
  for (const entry of sameSide) {
    const cluster = clusters.find((candidate) => Math.abs(candidate.depth - entry.depth) <= tolerance);
    if (cluster) {
      cluster.markers.push(entry.marker);
      cluster.depth = cluster.markers.reduce((sum, marker) => sum + (side === "left" ? marker.x : page.width - marker.x), 0) / cluster.markers.length;
    } else clusters.push({ depth: entry.depth, markers: [entry.marker] });
  }
  return clusters.sort((a, b) => a.depth - b.depth);
}

function participantAnchors(page: ParsedPage, side: "left" | "right"): VisualTextItem[] {
  const preferred = page.items.filter((item) => {
    const text = tidy(item.text);
    const center = item.x + item.width / 2;
    const onSide = side === "left" ? center < page.width / 2 : center >= page.width / 2;
    const onOuterEdge = side === "left"
      ? item.x < page.width * 0.22
      : item.x + item.width > page.width * 0.78;
    return onSide && onOuterEdge
      && item.y > page.height * 0.1 && item.y < page.height * 0.88
      && /(?:\([A-Z]{3}\)|\b[A-Z]{3})\s*$/i.test(text)
      && likelyName(text);
  });
  return preferred
    .sort((a, b) => a.y - b.y)
    .filter((item, index, items) => index === 0 || Math.abs(item.y - items[index - 1].y) > 3);
}

function openingMarkerForAthlete(
  markers: FightCode[],
  participants: VisualTextItem[],
  athleteY: number,
): FightCode | null {
  if (!markers.length || participants.length < 2) return null;
  const rows = participants.map((item) => item.y + item.height / 2);
  const athleteIndex = rows.reduce(
    (best, y, index) => Math.abs(y - athleteY) < Math.abs(rows[best] - athleteY) ? index : best,
    0,
  );
  const connected = markers.filter((marker) => {
    let pairIndex = 0;
    let pairDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < rows.length - 1; index += 1) {
      const distance = Math.abs(marker.y - (rows[index] + rows[index + 1]) / 2);
      if (distance < pairDistance) {
        pairDistance = distance;
        pairIndex = index;
      }
    }
    return athleteIndex === pairIndex || athleteIndex === pairIndex + 1;
  });
  return connected.sort((a, b) => Math.abs(a.y - athleteY) - Math.abs(b.y - athleteY))[0] ?? null;
}

function pathForAthlete(page: ParsedPage, anchor: VisualTextItem, markers: FightCode[], roster?: VisualTextItem[]): string[] {
  const side = anchor.x + anchor.width / 2 < page.width / 2 ? "left" : "right";
  const athleteDepth = side === "left" ? anchor.x : page.width - (anchor.x + anchor.width);
  const clusters = clusterByDepth(markers, page, side).filter((cluster) => cluster.depth > Math.max(0, athleteDepth - page.width * 0.02));
  let currentY = anchor.y + anchor.height / 2;
  const participants = roster?.filter((item) => (item.x + item.width / 2 < page.width / 2 ? "left" : "right") === side).sort((a, b) => a.y - b.y) ?? participantAnchors(page, side);
  const selected: FightCode[] = [];
  for (let clusterIndex = 0; clusterIndex < clusters.length; clusterIndex += 1) {
    const cluster = clusters[clusterIndex];
    if (clusterIndex === 0 && participants.length >= 2) {
      const opening = openingMarkerForAthlete(cluster.markers, participants, currentY);
      if (opening) {
        selected.push(opening);
        currentY = opening.y;
      }
      continue;
    }
    const candidates = cluster.markers
      .filter((marker) => !selected.some((chosen) => chosen.code === marker.code))
      .sort((a, b) => Math.abs(a.y - currentY) - Math.abs(b.y - currentY));
    const chosen = candidates[0];
    if (!chosen) continue;
    const typicalGap = cluster.markers.length > 1
      ? Math.max(...[...cluster.markers].sort((a, b) => a.y - b.y).map((marker, index, sorted) => index ? marker.y - sorted[index - 1].y : 0))
      : page.height;
    if (Math.abs(chosen.y - currentY) <= Math.max(page.height * 0.22, typicalGap)) {
      selected.push(chosen);
      currentY = chosen.y;
    }
  }
  return selected.map((marker) => marker.code);
}

function anchorsForTeam(page: ParsedPage, team: string): Array<{ anchor: VisualTextItem; name: string; sourceText: string }> {
  const teamKey = normalized(team);
  const results: Array<{ anchor: VisualTextItem; name: string; sourceText: string }> = [];
  for (const item of page.items) {
    if (!containsNormalizedPhrase(item.text, teamKey)) continue;
    const row = rowItems(page, item);
    const local = row.filter((candidate) => Math.abs((candidate.x + candidate.width / 2) - (item.x + item.width / 2)) < page.width * 0.28);
    let sourceText = tidy(local.map((candidate) => candidate.text).join(" "));
    const adjacentName = athleteNameAboveTeam(page, item, team);
    let name = adjacentName?.name ?? cleanAthleteName(sourceText, team);
    if (adjacentName) sourceText = tidy(`${adjacentName.item.text} ${sourceText}`);
    if (!likelyName(name)) name = cleanAthleteName(item.text, team);
    if (!likelyName(name)) {
      const nearby = page.items
        .filter((candidate) => candidate !== item && Math.abs(candidate.y - item.y) < 18 && Math.abs(candidate.x - item.x) < page.width * 0.2)
        .sort((a, b) => Math.hypot(a.x - item.x, a.y - item.y) - Math.hypot(b.x - item.x, b.y - item.y));
      name = cleanAthleteName(nearby[0]?.text ?? "", team);
    }
    if (!likelyName(name) || looksLikeTeamOnlyName(name)) continue;
    results.push({ anchor: item, name, sourceText: sourceText || item.text });
  }
  return results.filter((entry, index) => !results.some((other, otherIndex) =>
    otherIndex < index && normalized(other.name) === normalized(entry.name) && Math.abs(other.anchor.y - entry.anchor.y) < 8,
  ));
}

type DrawEntry = { anchor: VisualTextItem; name: string; country: string; affiliation: string; sourceText: string; format: "taekoplan" | "wt" | "unknown" };

function pageEntries(page: ParsedPage): DrawEntry[] {
  const entries: DrawEntry[] = [];
  const isOuter = (item: VisualTextItem) => item.x < page.width * 0.12 || item.x > page.width * 0.75;
  const bibs = page.items.filter((item) => isOuter(item) && /^[BR]\s*\/\s*\d+\b/i.test(tidy(item.text)));
  if (bibs.length) {
    for (const bib of bibs) {
      const sameSide = (item: VisualTextItem) => (item.x < page.width / 2) === (bib.x < page.width / 2);
      const nameParts = page.items.filter((item) => sameSide(item)
        && Math.abs(item.y - bib.y) <= Math.max(2, bib.height * 0.4)
        && item.x >= bib.x - 1 && item.x - bib.x < page.width * 0.24
        && !/^[A-Z]{3}$/.test(tidy(item.text)));
      const name = cleanAthleteName(nameParts.sort((a, b) => a.x - b.x).map((item) => item.text).join(" "), "");
      if (!likelyName(name) || looksLikeTeamOnlyName(name)) continue;
      const affiliationLine = page.items.filter((item) => sameSide(item) && isOuter(item)
        && item.y > bib.y + 3 && item.y - bib.y < Math.max(16, bib.height * 2.5)
        && !/^[BR]\s*\//i.test(tidy(item.text)) && /\p{L}/u.test(item.text))
        .sort((a, b) => a.y - b.y || Math.abs(a.x - bib.x) - Math.abs(b.x - bib.x))[0];
      const affiliationText = tidy(affiliationLine?.text ?? "");
      const country = affiliationText.match(/\b([A-Z]{3})\)?\s*$/)?.[1] ?? "";
      const affiliation = tidy(country ? affiliationText.replace(new RegExp(`\\s*\\(?${country}\\)?\\s*$`), "") : affiliationText);
      entries.push({ anchor: affiliationLine ?? bib, name, country, affiliation,
        sourceText: tidy(`${name} ${affiliationText}`), format: "taekoplan" });
    }
  } else {
    // Only outer participant rows are entrants. Interior winner names and
    // classification tables in completed draws are not additional athletes.
    const outerCandidates = page.items.filter((item) => {
      const center = item.x + item.width / 2;
      return (item.x < page.width * 0.23 || item.x + item.width > page.width * 0.77)
        && (center < page.width * 0.32 || center > page.width * 0.68)
        && item.y > page.height * 0.08 && item.y < page.height * 0.94;
    });
    const wrappedContinuations = new Set<VisualTextItem>();
    for (const item of outerCandidates) {
      if (!/^\s*\([X\d]+\)/i.test(item.text) || /\s[A-Z]{3}\)?\s*$/.test(item.text)) continue;
      const right = item.x + item.width / 2 > page.width / 2;
      const continuation = page.items.filter((other) => other.y > item.y + 1
        && other.y - item.y <= Math.max(12, item.height * 1.8)
        && Math.abs(right ? other.x + other.width - item.x - item.width : other.x - item.x) < 5
        && !/^\s*\([X\d]+\)/i.test(other.text) && /\b[A-Z]{3}\)?\s*$/.test(other.text))
        .sort((a, b) => a.y - b.y)[0];
      if (continuation) wrappedContinuations.add(continuation);
    }
    const candidates = outerCandidates.filter((item) => !wrappedContinuations.has(item)).map((item) => {
      // Long seeded names can wrap onto a second line, sometimes leaving only
      // the country there. Join by the aligned outer edge, not by search text.
      if (!/^\s*\([X\d]+\)/i.test(item.text) || /\s[A-Z]{3}\)?\s*$/.test(item.text)) return item;
      const right = item.x + item.width / 2 > page.width / 2;
      const continuation = page.items.filter((other) => other.y > item.y + 1
        && other.y - item.y <= Math.max(12, item.height * 1.8)
        && Math.abs(right ? other.x + other.width - item.x - item.width : other.x - item.x) < 5
        && !/^\s*\([X\d]+\)/i.test(other.text) && /\b[A-Z]{3}\)?\s*$/.test(other.text))
        .sort((a, b) => a.y - b.y)[0];
      if (!continuation) return item;
      const x = Math.min(item.x, continuation.x);
      return { ...item, x, width: Math.max(item.x + item.width, continuation.x + continuation.width) - x,
        text: `${item.text} ${continuation.text}` };
    });
    for (const item of candidates) {
      const text = tidy(item.text);
      // A seeded bracket may also contain many unseeded entrants. Keep those
      // outer rows, while rejecting result/classification ranks such as
      // "1 Alice Martin FRA" that are not bracket participants.
      if (!/^\([X\d]+\)\s*/i.test(text) && /^\d+[.)]?\s+/i.test(text)) continue;
      const match = text.match(/^(.+?)\s+\(?([A-Z]{3})\)?\s*$/);
      if (!match) continue;
      const name = cleanAthleteName(match[1], "");
      if (!likelyName(name) || looksLikeTeamOnlyName(name)) continue;
      // Livrets de résultats WT : le vainqueur est réimprimé dans l'arbre sous forme abrégée,
      // « NOM X.Y. (PAYS) ». Ce n'est pas un entrant.
      if (/\([A-Z]{3}\)\s*$/.test(text) && /(?:^|\s)(?:[A-Z]\.\s?)+$/.test(name)) continue;
      entries.push({ anchor: item, name, country: match[2], affiliation: "", sourceText: text, format: "wt" });
    }
  }
  return entries.filter((entry, index) => !entries.some((other, prior) => prior < index
    && normalized(other.name) === normalized(entry.name) && other.country === entry.country
    && normalized(other.affiliation) === normalized(entry.affiliation)
    && Math.abs(other.anchor.x - entry.anchor.x) < 10 && Math.abs(other.anchor.y - entry.anchor.y) < 10));
}

const drawIndexCache = new WeakMap<ParsedPage[], TeamDrawAnalysis>();

export function buildDrawIndex(pages: ParsedPage[]): TeamDrawAnalysis {
  const cached = drawIndexCache.get(pages);
  if (cached) return cached;
  const athletes: TeamAthlete[] = [];
  const warnings = pages.flatMap((page) => (page.extractionWarnings ?? []).map((warning) => `Page ${page.pageNumber}: ${warning}`));
  const divisions = divisionDetailsForPages(pages);
  for (const page of pages) {
    const markers = extractMarkers(page);
    const division = divisions.get(page.pageNumber) ?? parsedDivisionFor(page);
    const entries = pageEntries(page);
    const expectedCount = Number(page.rawText.match(/\bContestants\s*:?\s*(\d+)/i)?.[1]);
    if (expectedCount > entries.length) warnings.push(`Page ${page.pageNumber}: ${entries.length} athlete entries recognised; the draw lists ${expectedCount}. Please review this page.`);
    const roster = entries.map((entry) => entry.anchor);
    for (const found of entries) {
      const side = found.anchor.x + found.anchor.width / 2 < page.width / 2 ? "left" : "right";
      const path = pathForAthlete(page, found.anchor, markers, roster);
      const warnings: string[] = [];
      if (!path.length) warnings.push("No fight number was linked automatically.");
      if (path.length === 1 && markers.length > 1) warnings.push("Only one fight was linked; please check for an exemption or an incomplete path.");
      const confidence = Math.min(0.9, (page.extractionConfidence ?? 0.5) * 0.65 + (path.length ? 0.2 : 0));
      const legacyId = `${page.pageNumber}:${normalized(found.name)}:${Math.round(found.anchor.y)}`;
      athletes.push({
        id: athletes.some((athlete) => athlete.id === legacyId) ? `${legacyId}:${side}` : legacyId,
        name: found.name,
        team: found.affiliation || found.country,
        country: found.country,
        affiliation: found.affiliation,
        drawFormat: found.format,
        sourceBounds: { x: found.anchor.x, y: found.anchor.y, width: found.anchor.width, height: found.anchor.height },
        category: division.category,
        ageCategory: division.ageCategory,
        genderCategory: division.genderCategory,
        weightCategory: division.weightCategory,
        page: page.pageNumber,
        side,
        startFight: path[0],
        path,
        confidence,
        warnings,
        sourceText: found.sourceText,
        ...(found.format === "wt" && parseSeed(found.sourceText) !== undefined ? { seed: parseSeed(found.sourceText) } : {}),
      });
    }
  }
  if (!athletes.length && pages.length) warnings.push("No athlete entries could be recognised in this draw. Please check the PDF or add athletes manually.");
  if (pages.some((page) => (page.extractionConfidence ?? 1) < 0.38)) warnings.push("Some pages are difficult to read and must be reviewed.");
  const result = {
    athletes,
    pageCount: pages.length,
    ocrPageCount: pages.filter((page) => page.extractionMethod === "ocr").length,
    warnings,
  };
  drawIndexCache.set(pages, result);
  return result;
}

export type DrawSearchMode = "all" | "name" | "team";

export function searchDrawIndex(index: TeamDrawAnalysis, query: string, mode: DrawSearchMode = "all"): TeamDrawAnalysis {
  const tokens = normalized(query).split(" ").filter(Boolean);
  const matches = (value: string) => {
    const words = normalized(value).split(" ");
    return tokens.every((token) => words.some((word) => word === token || (token.length >= 2 && word.startsWith(token))));
  };
  const athletes = tokens.length ? index.athletes.filter((athlete) =>
    (mode !== "team" && matches(athlete.name))
    || (mode !== "name" && matches([athlete.country, athlete.affiliation, athlete.team].filter(Boolean).join(" ")))) : index.athletes;
  return { ...index, athletes, warnings: [...index.warnings,
    ...(!athletes.length && index.athletes.length ? [`No athlete matched “${query}”. Try a surname, first name, club or country code.`] : [])] };
}

export function analyzeTeamDraw(pages: ParsedPage[], query: string): TeamDrawAnalysis {
  const index = buildDrawIndex(pages);
  if (index.athletes.length) return searchDrawIndex(index, query);
  // Compatibility for unlabelled club-only layouts, before a format adapter is available.
  const divisions = divisionDetailsForPages(pages);
  const athletes = pages.flatMap((page) => anchorsForTeam(page, query).map((found): TeamAthlete => {
    const path = pathForAthlete(page, found.anchor, extractMarkers(page));
    return { id: `${page.pageNumber}:${normalized(found.name)}:${Math.round(found.anchor.y)}`, name: found.name,
      team: query, ...(divisions.get(page.pageNumber) ?? parsedDivisionFor(page)), page: page.pageNumber,
      side: found.anchor.x < page.width / 2 ? "left" : "right", path, startFight: path[0], confidence: 0.5,
      warnings: ["Unrecognised layout: review the athlete and fight numbers."], sourceText: found.sourceText };
  }));
  return { ...index, athletes, warnings: athletes.length ? ["Unrecognised layout: review the search results."] : index.warnings };
}
