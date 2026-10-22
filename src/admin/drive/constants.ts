import googledriveIcon from "./icons/googledrive.png";
import guangyapanIcon from "./icons/guangyapan.png";
import localstorageIcon from "./icons/localstorage.png";
import onedriveIcon from "./icons/onedrive.png";
import p115Icon from "./icons/p115.png";
import p123Icon from "./icons/p123.png";
import pikpakIcon from "./icons/pikpak.png";
import quarkIcon from "./icons/quark.png";
import webdavIcon from "./icons/webdav.png";
import wopanIcon from "./icons/wopan.png";
import {
  ONEDRIVE_AUTH_MODE_CUSTOM_APP,
  ONEDRIVE_AUTH_MODE_OPENLIST_API,
} from "./onedriveAuth";
import { scanOutcomeClasses, scanOutcomeLabels } from "./scanResults";

export type Kind = "quark" | "p115" | "p123" | "pikpak" | "wopan" | "guangyapan" | "onedrive" | "googledrive" | "webdav" | "localstorage";

export const kindAbbr: Record<string, string> = {
  quark: "Qk",
  p115: "115",
  p123: "123",
  pikpak: "Pk",
  wopan: "Wo",
  guangyapan: "GY",
  onedrive: "OD",
  googledrive: "GD",
  webdav: "WD",
  localstorage: "Lo",
};

export const kindIconPath: Record<string, string> = {
  quark: quarkIcon,
  p115: p115Icon,
  p123: p123Icon,
  pikpak: pikpakIcon,
  wopan: wopanIcon,
  guangyapan: guangyapanIcon,
  onedrive: onedriveIcon,
  googledrive: googledriveIcon,
  webdav: webdavIcon,
  localstorage: localstorageIcon,
};

export function driveKindAbbr(kind: string): string {
  const explicit = kindAbbr[kind];
  if (explicit) return explicit;

  const trimmed = kind.trim();
  if (!trimmed) return "??";
  const compact = trimmed.replace(/[^a-zA-Z0-9]+/g, "");
  return (compact || trimmed).slice(0, 2).toUpperCase();
}

export function driveKindIconPath(kind: string): string {
  return kindIconPath[kind] || "";
}

export const kindLabel: Record<string, string> = {
  quark: "夸克雲端硬碟",
  p115: "115 雲端硬碟",
  p123: "123雲端硬碟",
  pikpak: "PikPak",
  wopan: "聯通雲端硬碟",
  guangyapan: "光鴨雲端硬碟",
  onedrive: "OneDrive",
  googledrive: "Google Drive",
  webdav: "WebDAV",
  localstorage: "本機儲存",
};

export type FormState = {
  id: string;
  kind: Kind;
  name: string;
  rootId: string;
  creds: Record<string, string>;
};

export const emptyForm: FormState = {
  id: "",
  kind: "p115",
  name: "",
  rootId: "",
  creds: {},
};

export function scanAllButtonText(status: { running: boolean; queued: boolean }, triggering: boolean) {
  if (triggering) return "觸發中...";
  if (status.running) return "掃描執行中";
  if (status.queued) return "掃描已排隊";
  return "掃描所有雲端硬碟";
}

export function maintenanceBusyText(status: { running: boolean; queued: boolean }) {
  if (status.running || status.queued) return "目前有全量掃描任務正在進行，請稍後重試";
  return "";
}

export function generationStateLabel(state: string): string {
  if (Object.prototype.hasOwnProperty.call(scanOutcomeLabels, state)) return scanOutcomeLabels[state as keyof typeof scanOutcomeLabels];
  if (state === "scanning") return "掃描來源中";
  if (state === "uploading") return "上傳中";
  if (state === "generating") return "生成中";
  if (state === "cooling") return "冷卻中";
  if (state === "queued") return "排隊中";
  return "空閑";
}

export function generationStateClass(state: string): string {
  if (Object.prototype.hasOwnProperty.call(scanOutcomeClasses, state)) return scanOutcomeClasses[state as keyof typeof scanOutcomeClasses];
  if (state === "scanning" || state === "uploading" || state === "generating" || state === "cooling" || state === "queued") {
    if (state === "scanning" || state === "uploading") return "generating";
    return state;
  }
  return "idle";
}

export function generationDetail(status?: { state: string; cooldownUntil?: string; currentTitle?: string }): string {
  if (!status) return "";
  if (status.state === "cooling" && status.cooldownUntil) {
    return `剩餘 ${formatCooldownRemaining(status.cooldownUntil)}`;
  }
  if (status.currentTitle) {
    return status.currentTitle;
  }
  return "";
}

export function generationTitle(status: { state: string; cooldownUntil?: string; currentTitle?: string } | undefined, detail: string): string | undefined {
  if (!status) return detail || undefined;
  if (status.state === "cooling" && status.cooldownUntil) {
    return `冷卻至 ${formatClock(status.cooldownUntil)}`;
  }
  return status.currentTitle || detail || undefined;
}

export function formatCooldownRemaining(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const totalSeconds = Math.max(0, Math.ceil((d.getTime() - Date.now()) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}小時${minutes}分`;
  if (minutes > 0) return `${minutes}分${seconds}秒`;
  return `${seconds}秒`;
}

export function formatClock(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
}

export function defaultRootId(kind: Kind): string {
  if (kind === "pikpak") return "";
  if (kind === "guangyapan") return "";
  if (kind === "onedrive") return "root";
  if (kind === "googledrive") return "root";
  if (kind === "webdav") return "/";
  if (kind === "localstorage") return "/";
  return "0";
}

export function usesRootDirectoryID(kind: Kind): boolean {
  return kind !== "localstorage";
}

export function rootIdPlaceholder(kind: Kind): string {
  if (kind === "webdav") return "可填寫目錄路徑，留空表示根目錄";
  return "可填寫目錄ID，留空表示根目錄";
}

export function rootDirectoryLabel(kind: Kind): string {
  return kind === "webdav" ? "WebDAV根目錄(可選)" : "自定義雲端硬碟根目錄(可選)";
}

export type CredentialField = {
  key: string;
  label: string;
  placeholder: string;
  methodLabel?: string;
  type?: "text" | "select";
  options?: Array<{ value: string; label: string }>;
  multiline?: boolean;
  required?: boolean;
  defaultValue?: string;
  visibleWhen?: { key: string; value: string };
};

export function credentialFields(kind: Kind): CredentialField[] {
  switch (kind) {
    case "quark":
      return [
        {
          key: "cookie",
          label: "Cookie",
          placeholder: "__pus=...; __puus=...; ...",
          methodLabel: "或手動填寫",
          multiline: true,
          required: true,
        },
      ];
    case "p115":
      return [
        {
          key: "cookie",
          label: "Cookie",
          placeholder: "UID=xxx; CID=xxx; SEID=xxx; KID=xxx",
          methodLabel: "或手動填寫",
          multiline: true,
          required: true,
        },
      ];
    case "p123":
      return [
        {
          key: "username",
          label: "手機號/郵箱",
          placeholder: "手機號或郵箱",
          methodLabel: "或使用帳號密碼",
        },
        {
          key: "password",
          label: "密碼",
          placeholder: "123雲端硬碟密碼",
        },
      ];
    case "pikpak":
      return [
        {
          key: "username",
          label: "郵箱",
          placeholder: "user@example.com",
          methodLabel: "帳號密碼登入",
        },
        {
          key: "password",
          label: "密碼",
          placeholder: "PikPak 密碼",
        },
        {
          key: "refresh_token",
          label: "refresh_token",
          placeholder: "郵箱密碼登入不可用時填寫",
          methodLabel: "或使用重新整理權杖",
        },
      ];
    case "wopan":
      return [
        {
          key: "access_token",
          label: "access_token",
          placeholder: "",
          methodLabel: "或手動填寫",
          required: true,
        },
        {
          key: "refresh_token",
          label: "refresh_token",
          placeholder: "",
          required: true,
        },
      ];
    case "guangyapan":
      return [
        {
          key: "refresh_token",
          label: "refresh_token",
          placeholder: "推薦填寫，伺服器端會自動重新整理 access_token",
          methodLabel: "或手動填寫",
          multiline: true,
        },
        {
          key: "access_token",
          label: "access_token",
          placeholder: "Bearer eyJ... 或直接粘貼 token",
          multiline: true,
        },
      ];
    case "onedrive":
      return [
        {
          key: "auth_mode",
          label: "認證方式",
          placeholder: "",
          type: "select",
          defaultValue: ONEDRIVE_AUTH_MODE_OPENLIST_API,
          options: [
            {
              value: ONEDRIVE_AUTH_MODE_OPENLIST_API,
              label: "OpenList API",
            },
            {
              value: ONEDRIVE_AUTH_MODE_CUSTOM_APP,
              label: "自建應用",
            },
          ],
        },
        {
          key: "client_id",
          label: "用戶端 ID",
          placeholder: "Microsoft Entra 應用程序（用戶端）ID",
          visibleWhen: {
            key: "auth_mode",
            value: ONEDRIVE_AUTH_MODE_CUSTOM_APP,
          },
        },
        {
          key: "client_secret",
          label: "用戶端密鑰",
          placeholder: "請填寫用戶端密鑰值，不是密鑰 ID",
          visibleWhen: {
            key: "auth_mode",
            value: ONEDRIVE_AUTH_MODE_CUSTOM_APP,
          },
        },
        {
          key: "refresh_token",
          label: "refresh_token",
          placeholder: "與所用應用匹配的 OneDrive refresh_token",
          multiline: true,
          required: true,
        },
      ];
    case "googledrive":
      return [
        {
          key: "client_id",
          label: "用戶端 ID",
          placeholder: "xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com",
          required: true,
        },
        {
          key: "client_secret",
          label: "用戶端密鑰",
          placeholder: "Google OAuth client secret",
          required: true,
        },
        {
          key: "refresh_token",
          label: "refresh_token",
          placeholder: "Google OAuth refresh_token",
          multiline: true,
          required: true,
        },
      ];
    case "webdav":
      return [
        {
          key: "base_url",
          label: "WebDAV 地址",
          placeholder: "https://openlist.example.com/dav",
          required: true,
        },
        {
          key: "username",
          label: "用戶名",
          placeholder: "WebDAV 用戶名",
          required: true,
        },
        {
          key: "password",
          label: "密碼",
          placeholder: "WebDAV 密碼",
          required: true,
        },
      ];
    case "localstorage":
      return [
        {
          key: "path",
          label: "本機目錄路徑",
          placeholder: "/mnt/videos",
          required: true,
        },
        {
          key: "strm_allow_outside_root",
          label: ".strm 允許指向目錄外",
          placeholder: "",
          type: "select",
          defaultValue: "false",
          options: [
            { value: "false", label: "關閉（預設，僅允許目錄內路徑）" },
            { value: "true", label: "開啟（允許任意本機路徑）" },
          ],
        },
      ];
  }
}
