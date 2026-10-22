import { useState } from "react";
import "@/styles/admin-controls.css";
import "@/styles/login.css";
import { useAuth } from "./AuthContext";

export function AuthUnavailable() {
  const { refresh } = useAuth();
  const [retrying, setRetrying] = useState(false);

  async function retry() {
    if (retrying) return;
    setRetrying(true);
    try {
      await refresh();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="admin-loading-screen">
      <div className="auth-unavailable" role="alert">
        <div>暫時無法確認登入狀態，請稍後重試。</div>
        <button
          className="admin-btn is-primary"
          type="button"
          disabled={retrying}
          onClick={retry}
        >
          {retrying ? "重試中..." : "重試"}
        </button>
      </div>
    </div>
  );
}
