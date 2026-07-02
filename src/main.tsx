import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { error } from "@tauri-apps/plugin-log";
import "./index.css";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary";
import { installGlobalDiagnostics } from "./diagnostics";
import { initI18n, resolveInitialLanguage } from "./i18n";
import { loadSettings } from "./store";

document.addEventListener("contextmenu", (e) => e.preventDefault());

window.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "F7") {
      event.preventDefault();
    }
  },
  { capture: true },
);

installGlobalDiagnostics();

async function bootstrap() {
  let language: "en" | "zh" = "en";
  try {
    const settings = await loadSettings();
    language = resolveInitialLanguage(settings.language);
  } catch (e) {
    error(
      `Failed to load settings for language detection: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
  void invoke("set_ui_language", { lang: language }).catch(() => {});
  try {
    await initI18n(language);
  } catch (e) {
    error(
      `i18n init failed, falling back to English: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
    await initI18n("en");
  }

  createRoot(document.getElementById("root")!, {
    onCaughtError: (err, errorInfo) => {
      error(
        JSON.stringify({
          source: "createRoot.onCaughtError",
          error: err instanceof Error ? err.message : String(err),
          componentStack: errorInfo.componentStack,
          errorBoundary: errorInfo.errorBoundary?.constructor?.name,
        }),
      );
    },
  }).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}

void bootstrap();
