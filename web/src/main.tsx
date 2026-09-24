import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { LangProvider } from "./i18n.tsx";
import { SessionProvider } from "./session.tsx";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SessionProvider><LangProvider><App /></LangProvider></SessionProvider>
  </StrictMode>,
);
