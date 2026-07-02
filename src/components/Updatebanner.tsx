import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { error } from "@tauri-apps/plugin-log";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import UnavailableReason from "./UnavailableReason";
import "./Updatebanner.css";

interface UpdateBannerProps {
  currentVersion: string;
  latestVersion: string;
}

type UpdateStage = "ready" | "installing" | "restart-required" | "error";

export default function UpdateBanner({
  currentVersion,
  latestVersion,
}: UpdateBannerProps) {
  const { t } = useTranslation();
  const [stage, setStage] = useState<UpdateStage>("ready");
  const [statusText, setStatusText] = useState<string | null>(null);

  const handleUpdate = async () => {
    try {
      setStage("installing");
      setStatusText(t("settings:update.preparing"));

      const update = await check();
      if (!update) {
        setStage("ready");
        setStatusText(t("settings:update.noLongerAvailable"));
        return;
      }

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            setStatusText(t("settings:update.downloading"));
            break;
          case "Progress":
            setStatusText(t("settings:update.installingUpdate"));
            break;
          case "Finished":
            setStatusText(t("settings:update.installed"));
            break;
        }
      });

      setStage("restart-required");
      setStatusText(t("settings:update.installed"));
    } catch (err) {
      error(
        JSON.stringify({ source: "Updatebanner.install", error: String(err) }),
      );
      setStage("error");
      setStatusText(t("settings:update.installFailed"));
    }
  };

  const handleRestart = async () => {
    try {
      await relaunch();
    } catch (err) {
      error(
        JSON.stringify({ source: "Updatebanner.relaunch", error: String(err) }),
      );
      setStage("error");
      setStatusText(t("settings:update.restartFailed"));
    }
  };

  const installingUpdateText = t("settings:update.installingUpdate");
  const downloadingText = t("settings:update.downloading");

  const installDisabledReason =
    stage === "installing"
      ? statusText === installingUpdateText
        ? t("settings:update.alreadyInstalling")
        : statusText === downloadingText
          ? t("settings:update.alreadyDownloading")
          : t("settings:update.alreadyPreparing")
      : undefined;

  return (
    <div className="update-banner">
      <span className="update-banner-text-old-version">v{currentVersion}</span>
      <span className="update-banner-text">{t("settings:update.to")}</span>
      {/* does not need v for version, gets it from gitHub ↓  */}
      <span className="update-banner-text-new-version">{latestVersion}</span>
      {statusText && (
        <span className="update-banner-status" data-stage={stage}>
          {statusText}
        </span>
      )}
      {stage === "restart-required" ? (
        <button className="update-banner-btn" onClick={handleRestart}>
          {t("settings:update.restartToApply")}
        </button>
      ) : (
        <UnavailableReason reason={installDisabledReason}>
          <button
            className="update-banner-btn"
            onClick={handleUpdate}
            disabled={stage === "installing"}
          >
            {stage === "installing"
              ? t("settings:update.installing")
              : t("settings:update.downloadAndInstall")}
          </button>
        </UnavailableReason>
      )}
    </div>
  );
}
