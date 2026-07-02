import type { Settings } from "../../../store";

import { SETTINGS_LIMITS } from "../../../settingsSchema";
import { useTranslation } from "react-i18next";
import { InfoIcon, NumInput } from "./shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  showInfo: boolean;
}

export default function DutyCycleSection({
  settings,
  update,
  showInfo,
}: Props) {
  const { t } = useTranslation();
  return (
    <div className="adv-sectioncontainer adv-basic-card">
      <div className="adv-card-header">
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          {showInfo ? (
            <InfoIcon text={t("advanced:dutyCycle.tooltip")} />
          ) : null}
          <span className="adv-card-title">
            {t("advanced:dutyCycle.heading")}
          </span>
        </div>
        <div className="adv-row" style={{ gap: 6 }}>
          <div className="adv-minmax">
            <div className="adv-numbox-sm">
              <NumInput
                value={settings.dutyCycle}
                onChange={(v) => update({ dutyCycle: v })}
                min={SETTINGS_LIMITS.dutyCycle.min}
                max={SETTINGS_LIMITS.dutyCycle.max}
              />
              <span className="adv-unit">{t("common:unit.percent")}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
