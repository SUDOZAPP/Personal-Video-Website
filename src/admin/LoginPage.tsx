import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import "@/styles/admin-controls.css";
import "@/styles/login.css";
import { useAuth } from "./AuthContext";
import { AuthUnavailable } from "./AuthUnavailable";
import { useToast } from "@/components/ToastContext";
import * as api from "./api";
import { PasswordInput } from "./PasswordInput";

export function LoginPage() {
  const { status, login, refresh } = useAuth();
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [p2, setP2] = useState("");
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { show } = useToast();
  const passwordMismatch = setupRequired === true && p2.length > 0 && p !== p2;

  useEffect(() => {
    let active = true;
    api.setupStatus()
      .then((res) => {
        if (active) setSetupRequired(res.required);
      })
      .catch((e) => {
        if (active) {
          setSetupRequired(false);
          setErr(e instanceof Error ? e.message : "初始化狀態檢查失敗");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (status === "loading" || setupRequired === null) {
    return (
      <div className="admin-loading-screen">
        檢查登入狀態...
      </div>
    );
  }

  if (status === "unavailable") {
    return <AuthUnavailable />;
  }

  // 已登录：回到来源页，或默认去首页
  if (status === "authed") {
    const from = (location.state as { from?: string } | null)?.from ?? "/";
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (setupRequired && p !== p2) {
      setErr("兩次輸入的密碼不一致");
      return;
    }
    setLoading(true);
    try {
      if (setupRequired) {
        await api.setupAdmin(u, p);
        await refresh();
        setSetupRequired(false);
        show("管理員帳號已設定", "success");
        navigate("/admin", { replace: true });
        return;
      } else {
        const role = await login(u, p);
        show("登入成功", "success");
        if (role === "admin") {
          const from = (location.state as { from?: string } | null)?.from ?? "/admin";
          navigate(from, { replace: true });
        } else {
          navigate("/", { replace: true });
        }
        return;
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "登入失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-login">
      <form className="admin-login__card" onSubmit={handleSubmit}>
        <div className="admin-form">
          <div className="admin-form__row">
            <label htmlFor="admin-login-username">用戶名</label>
            <input
              id="admin-login-username"
              autoFocus
              value={u}
              onChange={(e) => setU(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div className="admin-form__row">
            <label htmlFor="admin-login-password">密碼</label>
            <PasswordInput
              id="admin-login-password"
              value={p}
              onChange={(e) => setP(e.target.value)}
              autoComplete={setupRequired ? "new-password" : "current-password"}
            />
          </div>
          {setupRequired && (
            <div className="admin-form__row">
              <label htmlFor="admin-login-password-confirm">確認密碼</label>
              <PasswordInput
                id="admin-login-password-confirm"
                value={p2}
                onChange={(e) => setP2(e.target.value)}
                autoComplete="new-password"
                className={passwordMismatch ? "is-invalid" : undefined}
                aria-invalid={passwordMismatch ? "true" : undefined}
                aria-describedby={passwordMismatch ? "admin-login-password-confirm-error" : undefined}
              />
              {passwordMismatch && (
                <div className="admin-form__error" id="admin-login-password-confirm-error">
                  密碼不一致
                </div>
              )}
            </div>
          )}
          <button
            className="admin-btn is-primary"
            type="submit"
            disabled={loading || !u || !p || (setupRequired && (!p2 || passwordMismatch))}
          >
            {loading
              ? setupRequired
                ? "儲存中..."
                : "登入中..."
              : setupRequired
              ? "儲存並進入"
              : "登入"}
          </button>
          {err && <div className="admin-login__error">{err}</div>}
        </div>
      </form>
    </div>
  );
}
