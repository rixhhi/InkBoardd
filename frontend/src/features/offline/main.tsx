import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { OfflineApp } from "./app.tsx";
import "../../styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OfflineApp />
  </StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("./sw.js", { type: "module" });
  });
}
