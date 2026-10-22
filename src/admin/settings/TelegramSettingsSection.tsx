import { TelegramIcon } from "@/components/icons/TelegramIcon";
import { SettingsSection } from "./SettingsSection";
import type { SettingsDraft, VisualField } from "./configYaml";
import "@/styles/telegram.css";

type Props = {
  active: boolean;
  disabled: boolean;
  draft: SettingsDraft;
  onChange: <Field extends VisualField>(
    field: Field,
    value: SettingsDraft[Field],
  ) => void;
};

export function TelegramSettingsSection({
  active,
  disabled,
  draft,
  onChange,
}: Props) {
  return (
    <div className="admin-telegram-settings" hidden={!active}>
      <SettingsSection
        id="config-telegram"
        index="03"
        icon={<TelegramIcon size={16} />}
        title="Telegram"
        description="管理機器人連接與影片接收"
      >
        <fieldset disabled={disabled || !active}>
          <div className="tg-enable-row">
            <div>
              <label
                id="telegram-enabled-label"
                htmlFor="telegram-enabled-toggle"
              >
                啟用 Telegram
              </label>
            </div>
            <button
              id="telegram-enabled-toggle"
              type="button"
              className={`toggle-switch ${draft.telegramEnabled ? "is-on" : ""}`}
              role="switch"
              aria-checked={draft.telegramEnabled}
              aria-labelledby="telegram-enabled-label"
              disabled={disabled || !active}
              onClick={() =>
                onChange("telegramEnabled", !draft.telegramEnabled)
              }
            >
              <span className="toggle-switch__dot" />
            </button>
          </div>
          <section
            className="tg-setting-group"
            aria-labelledby="tg-credentials-title"
          >
            <h3 id="tg-credentials-title">機器人憑據</h3>
            <div className="tg-fields tg-fields--thirds">
              <label>
                Bot Token
                <input
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={draft.telegramBotToken}
                  onChange={(e) => onChange("telegramBotToken", e.target.value)}
                  placeholder="填寫 BotFather 提供的 Token"
                />
              </label>
            </div>
          </section>
          <section
            className="tg-setting-group"
            aria-labelledby="tg-access-title"
          >
            <h3 id="tg-access-title">接收設定</h3>
            <div className="tg-fields tg-fields--thirds">
              <label className="tg-field--single-line">
                <span>允許的用戶 ID（機器人僅接收指定用戶發送的影片）</span>
                <input
                  value={draft.telegramAllowedUserIds}
                  onChange={(e) =>
                    onChange("telegramAllowedUserIds", e.target.value)
                  }
                  placeholder="123456789, 987654321"
                />
              </label>
              <label>
                站點地址（選填）
                <input
                  type="url"
                  value={draft.telegramSiteBaseUrl}
                  onChange={(e) =>
                    onChange("telegramSiteBaseUrl", e.target.value)
                  }
                  placeholder="https://video.example.com"
                />
              </label>
            </div>
          </section>
          <section
            className="tg-setting-group"
            aria-labelledby="tg-download-title"
          >
            <h3 id="tg-download-title">下載設定</h3>
            <div className="tg-fields tg-fields--thirds">
              <label>
                檔案上限（GiB）
                <input
                  type="number"
                  min="0.01"
                  max="16"
                  step="0.01"
                  value={draft.telegramMaxFileSizeBytes / 1024 ** 3}
                  onChange={(e) =>
                    onChange(
                      "telegramMaxFileSizeBytes",
                      Math.round(Number(e.target.value) * 1024 ** 3),
                    )
                  }
                />
              </label>
              <label>
                待處理任務上限
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={draft.telegramMaxPendingJobs}
                  onChange={(e) =>
                    onChange("telegramMaxPendingJobs", Number(e.target.value))
                  }
                />
              </label>
              <label>
                獲取超時（秒）
                <input
                  type="number"
                  min="30"
                  max="86400"
                  value={draft.telegramFetchTimeoutSeconds}
                  onChange={(e) =>
                    onChange(
                      "telegramFetchTimeoutSeconds",
                      Number(e.target.value),
                    )
                  }
                />
              </label>
            </div>
          </section>
        </fieldset>
      </SettingsSection>
    </div>
  );
}
