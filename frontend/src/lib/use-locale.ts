import { useEffect, useState } from "react";
import { otherLocale, type Locale } from "@inkboard/shared/i18n";

const LOCALE_KEY = "inkboard.locale";

export function useChromeLocale() {
  const [locale, setLocale] = useState<Locale>("en");
  useEffect(() => {
    const read = () => {
      try {
        setLocale(localStorage.getItem(LOCALE_KEY) === "hi" ? "hi" : "en");
      } catch {
        setLocale("en");
      }
    };
    read();
    window.addEventListener("inkboard-locale", read);
    return () => window.removeEventListener("inkboard-locale", read);
  }, []);
  function toggle() {
    const next = otherLocale(locale);
    try {
      localStorage.setItem(LOCALE_KEY, next);
    } catch {
      /* private mode */
    }
    setLocale(next);
    window.dispatchEvent(new Event("inkboard-locale"));
  }
  return { locale, toggle };
}
