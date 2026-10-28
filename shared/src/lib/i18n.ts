/** English stays the default. Hindi covers the rail, home, and the offline line. */

export const LOCALES = ["en", "hi"] as const;
export type Locale = (typeof LOCALES)[number];

const HINDI: Record<string, string> = {
  home: "होम",
  live: "लाइव",
  library: "पुस्तकालय",
  planner: "आज",
  saves: "सेव",
  search: "खोज",
  searchWhere: "कक्षा और शिक्षक खोजें",
  pickExam: "परीक्षा चुनें",
  continueLine: "कक्षा जारी रखें, या शिक्षक और लेक्चर खोजें",
  offline: "आप ऑफ़लाइन हैं",
  offlineBody: "इस डिवाइस पर सेव किया काम चलता रहेगा",
  tryAgain: "फिर कोशिश करें",
};

export function isLocale(value: string): value is Locale {
  return value === "en" || value === "hi";
}

export function otherLocale(locale: Locale): Locale {
  return locale === "en" ? "hi" : "en";
}

/** Hindi when that language is on and the phrase exists. Otherwise the English already on the screen. */
export function chromeLabel(locale: Locale, id: string, english: string): string {
  if (locale !== "hi") return english;
  const phrase = HINDI[id];
  return phrase && phrase !== english ? phrase : english;
}

export function hindiKeys(): string[] {
  return Object.keys(HINDI);
}
