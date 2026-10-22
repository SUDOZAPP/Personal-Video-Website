import { useEffect, useState } from "react";
import { QrCode } from "lucide-react";
import * as api from "../api";
import { useToast } from "@/components/ToastContext";

export function P123QRCodeLogin({ onToken }: { onToken: (token: string) => void }) {
  const { show } = useToast();
  const [session, setSession] = useState<api.P123QRSession | null>(null);
  const [status, setStatus] = useState<api.P123QRStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [pollingError, setPollingError] = useState("");
  const [completed, setCompleted] = useState(false);

  async function start() {
    setStarting(true);
    setPollingError("");
    setCompleted(false);
    setStatus(null);
    try {
      const next = await api.startP123QRLogin();
      setSession(next);
    } catch (e) {
      setSession(null);
      show(e instanceof Error ? e.message : "生成二維碼失敗", "error");
    } finally {
      setStarting(false);
    }
  }

  useEffect(() => {
    if (!session || completed) return;
    const activeSession = session;
    let stopped = false;
    let inFlight = false;
    let timer: number | undefined;

    async function poll() {
      if (stopped || inFlight) return;
      inFlight = true;
      try {
        const next = await api.getP123QRStatus(activeSession.uniID, activeSession.loginUuid);
        if (stopped) return;
        setStatus(next);
        setPollingError("");
        if (next.accessToken) {
          stopped = true;
          if (timer) window.clearInterval(timer);
          setCompleted(true);
          onToken(next.accessToken);
          show("掃碼成功，儲存後生效", "success");
          return;
        }
        if (next.loginStatus === 2 || next.loginStatus === 4) {
          stopped = true;
          if (timer) window.clearInterval(timer);
        }
      } catch (e) {
        if (stopped) return;
        setPollingError(e instanceof Error ? e.message : "查詢掃碼狀態失敗");
      } finally {
        inFlight = false;
      }
    }

    poll();
    timer = window.setInterval(poll, 1800);
    return () => {
      stopped = true;
      if (timer) window.clearInterval(timer);
    };
  }, [session, completed, onToken, show]);

  return (
    <div className="admin-form__row admin-drive-qr-login">
      <span className="admin-form__label">掃碼登入</span>
      <div className="admin-p123-qr">
        <div className="admin-p123-qr__actions">
          <button
            type="button"
            className="admin-btn"
            onClick={start}
            disabled={starting}
          >
            <QrCode size={14} />
            {starting ? "生成中..." : session ? "重新生成二維碼" : "生成二維碼"}
          </button>
        </div>

        {session && (
          <div className="admin-p123-qr__body">
            <img
              className="admin-p123-qr__image"
              src={session.qrImageDataUrl}
              alt="123雲端硬碟掃碼登入二維碼"
            />
            <div className="admin-p123-qr__meta">
              {pollingError && (
                <div className="admin-form__help">
                  {pollingError}
                </div>
              )}
              {session.expiresAt && (
                <div className="admin-form__help">
                  過期時間：{new Date(session.expiresAt).toLocaleTimeString("zh-TW", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </div>
              )}
              {(status?.loginStatus === 2 || status?.loginStatus === 4) && (
                <div className="admin-form__help">
                  目前二維碼{status.loginStatus === 2 ? "已被拒絕" : "已過期"}，請重新生成。
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
