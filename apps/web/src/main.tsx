import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// After a deploy, a tab opened earlier asks for page files that are gone. Reload once to get the new ones.
window.addEventListener("vite:preloadError", (event) => {
  // Without storage there's no way to tell a second failure from the first, so leave it to the error page.
  try {
    if (Date.now() - Number(sessionStorage.getItem("reloadedForUpdate")) < 10_000) return;
    sessionStorage.setItem("reloadedForUpdate", String(Date.now()));
  } catch {
    return;
  }
  event.preventDefault();
  location.reload();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
