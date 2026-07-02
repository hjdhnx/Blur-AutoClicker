import type { Settings } from "../../../store";
import { useTranslation } from "react-i18next";

import { SETTINGS_LIMITS } from "../../../settingsSchema";
import {
  Disableable,
  NumInput,
  ToggleBtn,
  CardDivider,
  InfoIcon,
} from "../advanced/shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  showInfo: boolean;
}

const CORNER_KEYS = {
  tl: "cornerStopTL",
  tr: "cornerStopTR",
  bl: "cornerStopBL",
  br: "cornerStopBR",
} as const;

const EDGE_KEYS = {
  top: "edgeStopTop",
  right: "edgeStopRight",
  left: "edgeStopLeft",
  bottom: "edgeStopBottom",
} as const;

export default function FailsafeSection({ settings, update, showInfo }: Props) {
  const { t } = useTranslation();
  return (
    <>
      <div className="adv-sectioncontainer">
        <div className="adv-card-header">
          <div
            style={{
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            {showInfo ? (
              <InfoIcon text={t("zones:cornerStop.tooltip")} />
            ) : null}
            <span className="adv-card-title">
              {t("zones:cornerStop.heading")}
            </span>
          </div>
          <ToggleBtn
            value={settings.cornerStopEnabled}
            onChange={(v) => update({ cornerStopEnabled: v })}
          />
        </div>
        <CardDivider />
        <Disableable
          enabled={settings.cornerStopEnabled}
          disabledReason={t("zones:cornerStop.disabledReason")}
        >
          <div className="adv-row" style={{ gap: 8 }}>
            <div className="adv-corner-grid">
              {(["tl", "tr", "bl", "br"] as const).map((cornerKey) => (
                <div
                  key={cornerKey}
                  className="adv-corner-box adv-stop-boundary-box"
                >
                  <div className={`adv-arc adv-arc-${cornerKey}`} />
                  <NumInput
                    value={settings[CORNER_KEYS[cornerKey]]}
                    onChange={(v) => update({ [CORNER_KEYS[cornerKey]]: v })}
                    min={SETTINGS_LIMITS.stopBoundary.min}
                    max={SETTINGS_LIMITS.stopBoundary.max}
                    style={{ width: "74px", textAlign: "right" }}
                  />
                  <span className="adv-unit">{t("common:unit.px")}</span>
                </div>
              ))}
            </div>
          </div>
        </Disableable>
      </div>

      <div className="adv-sectioncontainer">
        <div className="adv-card-header">
          <div
            style={{
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            {showInfo ? <InfoIcon text={t("zones:edgeStop.tooltip")} /> : null}
            <span className="adv-card-title">
              {t("zones:edgeStop.heading")}
            </span>
          </div>
          <ToggleBtn
            value={settings.edgeStopEnabled}
            onChange={(v) => update({ edgeStopEnabled: v })}
          />
        </div>
        <CardDivider />
        <Disableable
          enabled={settings.edgeStopEnabled}
          disabledReason={t("zones:edgeStop.disabledReason")}
        >
          <div className="adv-row" style={{ gap: 8 }}>
            <div className="adv-corner-grid">
              {(["top", "right", "left", "bottom"] as const).map((edgeSide) => (
                <div
                  key={edgeSide}
                  className="adv-corner-box adv-stop-boundary-box"
                >
                  <div className={`adv-edge-bar adv-edge-bar-${edgeSide}`} />
                  <NumInput
                    value={settings[EDGE_KEYS[edgeSide]]}
                    onChange={(v) => update({ [EDGE_KEYS[edgeSide]]: v })}
                    min={SETTINGS_LIMITS.stopBoundary.min}
                    max={SETTINGS_LIMITS.stopBoundary.max}
                    style={{ width: "74px", textAlign: "right" }}
                  />
                  <span className="adv-unit">{t("common:unit.px")}</span>
                </div>
              ))}
            </div>
          </div>
        </Disableable>
      </div>
    </>
  );
}
