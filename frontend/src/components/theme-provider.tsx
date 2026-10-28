import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { applyTheme, readThemeMode, resolvedTheme, writeThemeMode, type ThemeMode } from "@inkboard/shared/theme";

const ThemeCtx = createContext<{
  mode: ThemeMode;
  resolved: "dark" | "light";
  setMode: (m: ThemeMode) => void;
}>({ mode: "system", resolved: "dark", setMode: () => undefined });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [systemDark, setSystemDark] = useState(true);

  useEffect(() => {
    setModeState(readThemeMode());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    applyTheme(mode);
  }, [mode, systemDark]);

  const value = useMemo(
    () => ({
      mode,
      resolved: resolvedTheme(mode, systemDark),
      setMode: (m: ThemeMode) => {
        setModeState(m);
        writeThemeMode(m);
      },
    }),
    [mode, systemDark],
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}
