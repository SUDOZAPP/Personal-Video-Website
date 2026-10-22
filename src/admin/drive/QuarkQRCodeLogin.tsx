import { useEffect, useState } from "react";
import { QrCode } from "lucide-react";
import * as api from "../api";
import { useToast } from "@/components/ToastContext";

export function QuarkQRCodeLogin({ onCookie }: { onCookie: (cookie: string) => void }) {
  const { show } = useToast();
  const [session, setSession] = useState<api.QuarkQRSession | null>(null);
  const [status, setStatus] = useState<api.QuarkQRStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [pollingError, setPollingError] = useState("");
  const [completed, setCompleted] = useState(false);

  async function start() {
    setStarting(true);
    setSession(null);
    setStatus(null);
    setPollingError("");
    setCompleted(false);
    try {
      const next = await api.startQuarkQRLogin();
      setSession(next);
    } catch (e) {
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
        const next = await api.getQuarkQRStatus(activeSession.token);
        if (stopped) return;
        setStatus(next);
        setPollingError("");
        if (next.state === "success") {
          stopped = true;
          if (timer) window.clearInterval(timer);
          if (!next.cookie) {
            setPollingError("登入成功但未獲取到 Cookie，請重新生成二維碼");
            return;
          }
          setCompleted(true);
          onCookie(next.cookie);
          show("掃碼成功，已填入 Cookie，儲存後生效", "success");
          return;
        }
        if (next.state === "expired" || next.state === "error") {
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
    timer = window.setInterval(poll, 2000);
    return () => {
      stopped = true;
      if (timer) window.clearInterval(timer);
    };
  }, [session, completed, onCookie, show]);

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
              alt="夸克雲端硬碟掃碼登入二維碼"
            />
            <div className="admin-p123-qr__meta" aria-live="polite">
              {pollingError && (
                <div className="admin-form__help">{pollingError}</div>
              )}
              {status?.state === "expired" && (
                <div className="admin-form__help">目前二維碼已過期，請重新生成。</div>
              )}
              {status?.state === "error" && (
                <div className="admin-form__help">掃碼狀態異常，請重新生成二維碼。</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
