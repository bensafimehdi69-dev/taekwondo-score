/**
 * Drapeau d'un pays à partir de son code de délégation (CIO / World Taekwondo, « KOR », « IRI »…).
 * Emoji composé de deux indicateurs régionaux (code ISO 3166-1 alpha-2) : natif sur iPhone et Android.
 * Pas de drapeau pour les équipes sans pays (« WT » et « TRT » réfugiés, « AIN » neutres) ni pour un code inconnu :
 * rien n'est deviné.
 */
const IOC_TO_ISO: Record<string, string> = {
  AFG: "AF", ALB: "AL", ALG: "DZ", AND: "AD", ANG: "AO", ANT: "AG", ARG: "AR", ARM: "AM", ARU: "AW", ASA: "AS",
  AUS: "AU", AUT: "AT", AZE: "AZ", BAH: "BS", BAN: "BD", BAR: "BB", BDI: "BI", BEL: "BE", BEN: "BJ", BER: "BM",
  BHU: "BT", BIH: "BA", BIZ: "BZ", BLR: "BY", BOL: "BO", BOT: "BW", BRA: "BR", BRN: "BH", BRU: "BN", BUL: "BG",
  BUR: "BF", CAF: "CF", CAM: "KH", CAN: "CA", CAY: "KY", CGO: "CG", CHA: "TD", CHI: "CL", CHN: "CN", CIV: "CI",
  CMR: "CM", COD: "CD", COK: "CK", COL: "CO", COM: "KM", CPV: "CV", CRC: "CR", CRO: "HR", CUB: "CU", CYP: "CY",
  CZE: "CZ", DEN: "DK", DJI: "DJ", DMA: "DM", DOM: "DO", ECU: "EC", EGY: "EG", ERI: "ER", ESA: "SV", ESP: "ES",
  EST: "EE", ETH: "ET", FIJ: "FJ", FIN: "FI", FRA: "FR", FSM: "FM", GAB: "GA", GAM: "GM", GBR: "GB", GBS: "GW",
  GEO: "GE", GEQ: "GQ", GER: "DE", GHA: "GH", GRE: "GR", GRN: "GD", GUA: "GT", GUI: "GN", GUM: "GU", GUY: "GY",
  HAI: "HT", HKG: "HK", HON: "HN", HUN: "HU", INA: "ID", IND: "IN", IRI: "IR", IRL: "IE", IRQ: "IQ", ISL: "IS",
  ISR: "IL", ISV: "VI", ITA: "IT", IVB: "VG", JAM: "JM", JOR: "JO", JPN: "JP", KAZ: "KZ", KEN: "KE", KGZ: "KG",
  KIR: "KI", KOR: "KR", KOS: "XK", KSA: "SA", KUW: "KW", LAO: "LA", LAT: "LV", LBA: "LY", LBN: "LB", LBR: "LR",
  LCA: "LC", LES: "LS", LIE: "LI", LTU: "LT", LUX: "LU", MAC: "MO", MAD: "MG", MAR: "MA", MAS: "MY", MAW: "MW",
  MDA: "MD", MDV: "MV", MEX: "MX", MGL: "MN", MHL: "MH", MKD: "MK", MLI: "ML", MLT: "MT", MNE: "ME", MON: "MC",
  MOZ: "MZ", MRI: "MU", MTN: "MR", MYA: "MM", NAM: "NA", NCA: "NI", NED: "NL", NEP: "NP", NGR: "NG", NIG: "NE",
  NOR: "NO", NRU: "NR", NZL: "NZ", OMA: "OM", PAK: "PK", PAN: "PA", PAR: "PY", PER: "PE", PHI: "PH", PLE: "PS",
  PLW: "PW", PNG: "PG", POL: "PL", POR: "PT", PRK: "KP", PUR: "PR", QAT: "QA", ROU: "RO", RSA: "ZA", RUS: "RU",
  RWA: "RW", SAM: "WS", SEN: "SN", SEY: "SC", SGP: "SG", SKN: "KN", SLE: "SL", SLO: "SI", SMR: "SM", SOL: "SB",
  SOM: "SO", SRB: "RS", SRI: "LK", SSD: "SS", STP: "ST", SUD: "SD", SUI: "CH", SUR: "SR", SVK: "SK", SWE: "SE",
  SWZ: "SZ", SYR: "SY", TAN: "TZ", TGA: "TO", THA: "TH", TJK: "TJ", TKM: "TM", TLS: "TL", TOG: "TG", TPE: "TW",
  TTO: "TT", TUN: "TN", TUR: "TR", TUV: "TV", UAE: "AE", UGA: "UG", UKR: "UA", URU: "UY", USA: "US", UZB: "UZ",
  VAN: "VU", VEN: "VE", VIE: "VN", VIN: "VC", YEM: "YE", ZAM: "ZM", ZIM: "ZW",
  // Membres de World Taekwondo sans code CIO : Nouvelle-Calédonie, Polynésie française.
  NCD: "NC", FPO: "PF",
  // Variantes rencontrées sur certaines feuilles (codes ISO alpha-3 au lieu des codes CIO).
  DEU: "DE", NLD: "NL", CHE: "CH", PRT: "PT", GRC: "GR", HRV: "HR", SVN: "SI", DNK: "DK", IRN: "IR", SAU: "SA",
  ARE: "AE", TWN: "TW", ZAF: "ZA", MYS: "MY", IDN: "ID", PHL: "PH", VNM: "VN", NGA: "NG", DZA: "DZ",
};

export function flagOf(country: string | undefined): string {
  const iso = country ? IOC_TO_ISO[country.trim().toUpperCase()] : undefined;
  if (!iso) return "";
  return String.fromCodePoint(...[...iso].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));
}
