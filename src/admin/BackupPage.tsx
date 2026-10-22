import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useNavigate } from "react-router";
import {
  Archive,
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  Loader2,
  Plus,
} from "lucide-react";
import { FileIcon } from "@/components/icons/FileIcon";
import { ServerIcon } from "@/components/icons/ServerIcon";
import { copyTextToClipboard } from "@/lib/clipboard";
import { sha256Blob } from "@/lib/sha256";
import * as api from "./api";
import { useAuth } from "./AuthContext";
import { ConfirmModal } from "./ConfirmModal";
import { Modal } from "./Modal";
import { useToast } from "@/components/ToastContext";
import { useAdminRouteActive } from "./AdminRouteCache";
import { useAdminFloatingActionSpace } from "./useAdminFloatingActionSpace";
import { useAdminResource } from "./useAdminResource";

const RESUME_KEY = "video-site-91-backup-upload-v1";
const RESTORE_CONFIRMATION_GRACE_MS = 30_000;
const RESTORE_POLL_INTERVAL_MS = 1_200;

type ResumeState = {
  id: string;
  fileName: string;
  size: number;
  lastModified: number;
};

const BACKUP_SELECTION_OPTIONS: Array<{
  key: keyof api.BackupSelection;
  label: string;
}> = [
  { key: "cloudDrives", label: "雲端硬碟憑證和對應影片資源" },
  { key: "crawlerScripts", label: "爬蟲腳本和對應的影片資源" },
  { key: "uploadStorage", label: "上傳儲存和對應影片資源" },
  { key: "localStorage", label: "本機儲存和對應的影片資源" },
  { key: "userInfo", label: "用戶資訊" },
];

const EMPTY_BACKUP_SELECTION: api.BackupSelection = {
  cloudDrives: false,
  crawlerScripts: false,
  uploadStorage: false,
  localStorage: false,
  userInfo: false,
};

function formatBytes(value: number | undefined) {
  if (!value || value <= 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 100 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

function formatTime(value: string | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-TW");
}

function backupSelectionLabels(selection: api.BackupSelection | undefined) {
  if (!selection) return ["范圍不可用"];
  const labels = BACKUP_SELECTION_OPTIONS.filter((option) => selection[option.key]).map(
    (option) => option.label
  );
  return labels.length > 0 ? labels : ["未選擇內容"];
}

function taskActive(task: api.BackupTask | undefined) {
  return task?.state === "queued" || task?.state === "running" || task?.state === "canceling";
}

function transferActive(transfer: api.BackupTransferJob) {
  return ["queued", "connecting", "uploading", "finalizing", "retrying"].includes(
    transfer.state
  );
}

function receiveTransferActive(transfer: api.BackupReceiveTransfer) {
  return transfer.state === "uploading" || transfer.state === "finalizing";
}

function visibleProgressTransfers<T extends { state: string }>(
  transfers: T[],
  isActive: (transfer: T) => boolean
) {
  const active = transfers.filter(isActive);
  const recentFailures = transfers
    .filter((transfer) => transfer.state === "failed")
    .slice(0, Math.max(0, 5 - active.length));
  return [...active, ...recentFailures];
}

function transferStateLabel(state: string) {
  switch (state) {
    case "queued":
      return "等待發送";
    case "connecting":
      return "連接目標伺服器";
    case "uploading":
      return "伺服器直傳中";
    case "finalizing":
      return "目標伺服器校驗入庫";
    case "retrying":
      return "連接中斷，等待重試";
    case "completed":
      return "發送完成";
    case "failed":
      return "發送失敗";
    case "canceled":
      return "已取消";
    default:
      return state;
  }
}

function receiveTransferStateLabel(state: string) {
  switch (state) {
    case "uploading":
      return "正在接收備份包";
    case "finalizing":
      return "正在校驗並入庫";
    case "completed":
      return "接收完成";
    case "failed":
      return "接收失敗";
    case "canceled":
      return "接收已取消";
    default:
      return state;
  }
}

function shouldConfirmRestoreAfterTransportError(error: unknown) {
  if (error instanceof api.UnauthorizedError) return false;
  return !(error instanceof api.APIResponseError) || error.status >= 500;
}

function taskPhase(phase: string | undefined) {
  switch (phase) {
    case "estimating":
      return "統計資料";
    case "snapshotting":
      return "建立一致性快照";
    case "hashing":
      return "計算檔案校驗值";
    case "compressing":
      return "寫入備份包";
    case "verifying":
      return "進行完整校驗";
    case "canceling":
      return "正在取消";
    case "completed":
      return "已完成";
    case "canceled":
      return "已取消";
    case "failed":
      return "失敗";
    default:
      return "準備中";
  }
}

type ChecklistState = "done" | "active" | "pending";

type ChecklistStep = {
  title: string;
  state: ChecklistState;
};

function checklistState(index: number, activeIndex: number, complete = false): ChecklistState {
  if (complete || index < activeIndex) return "done";
  return index === activeIndex ? "active" : "pending";
}

function operationPercent(progress: api.BackupOperationProgress | undefined) {
  if (!progress?.totalBytes) return null;
  return Math.min(100, Math.max(0, (progress.processedBytes / progress.totalBytes) * 100));
}

function operationDetail(percent: number | null) {
  if (percent === null) return "處理中";
  return `${percent.toFixed(1)}%`;
}

function BackupOperationChecklist({
  title,
  steps,
  progress,
}: {
  title: string;
  steps: ChecklistStep[];
  progress?: api.BackupOperationProgress;
}) {
  const percent = operationPercent(progress);

  return (
    <section className="backup-operation-checklist" role="status" aria-live="polite">
      <div className="backup-operation-checklist__head">
        <strong>{title}</strong>
      </div>
      <ol className="backup-operation-steps">
        {steps.map((step, index) => (
          <li key={step.title} className={`is-${step.state}`}>
            <span className="backup-operation-step__marker" aria-hidden="true">
              {step.state === "done" ? (
                <Check size={14} strokeWidth={2.6} />
              ) : step.state === "active" ? (
                <Loader2 size={14} className="admin-spin" />
              ) : (
                index + 1
              )}
            </span>
            <div className="backup-operation-step__content">
              <strong>{step.title}</strong>
              <span className="sr-only">
                {step.state === "done" ? "已完成" : step.state === "active" ? "進行中" : "等待"}
              </span>
              {step.state === "active" && (
                <div className="backup-operation-step__progress">
                  <div
                    className={`backup-progress ${percent === null ? "is-indeterminate" : ""}`}
                    role={percent === null ? undefined : "progressbar"}
                    aria-valuemin={percent === null ? undefined : 0}
                    aria-valuemax={percent === null ? undefined : 100}
                    aria-valuenow={percent === null ? undefined : Math.round(percent)}
                  >
                    <span style={percent === null ? undefined : { width: `${percent}%` }} />
                  </div>
                  <span>{operationDetail(percent)}</span>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function uploadFinalizeStepIndex(phase: string | undefined) {
  switch (phase) {
    case "inspecting-archive":
    case "verifying-archive":
    case "verifying-database":
      return 2;
    case "publishing":
      return 3;
    default:
      return 1;
  }
}

function restorePrepareStepIndex(phase: string | undefined) {
  switch (phase) {
    case "extracting":
      return 1;
    case "checking-database":
      return 2;
    case "rewriting":
      return 3;
    case "preparing-switch":
    case "ready":
      return 4;
    default:
      return 0;
  }
}

function readResumeState(): ResumeState | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(RESUME_KEY) ?? "null") as ResumeState | null;
    if (
      parsed &&
      typeof parsed.id === "string" &&
      typeof parsed.fileName === "string" &&
      typeof parsed.size === "number"
    ) {
      return parsed;
    }
  } catch {
    // Ignore a damaged local resume hint.
  }
  return null;
}

export function BackupPage() {
  const floatingActionPageRef = useAdminFloatingActionSpace<HTMLDivElement>();
  const navigate = useNavigate();
  const routeActive = useAdminRouteActive();
  const { invalidateSession } = useAuth();
  const { show } = useToast();
  const [cancelingReceiveIds, setCancelingReceiveIds] = useState<Set<string>>(
    () => new Set()
  );
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [backupSelection, setBackupSelection] = useState<api.BackupSelection>(
    EMPTY_BACKUP_SELECTION
  );
  const [expandedBackupId, setExpandedBackupId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<api.BackupRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<api.BackupRecord | null>(null);
  const [restoreText, setRestoreText] = useState("");
  const [restoreSubmitting, setRestoreSubmitting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restartManaged, setRestartManaged] = useState(true);
  const [restoreReport, setRestoreReport] = useState<api.RestoreReport | null>(null);
  const [sendTarget, setSendTarget] = useState<api.BackupRecord | null>(null);
  const [sendURL, setSendURL] = useState("");
  const [sendToken, setSendToken] = useState("");
  const [sending, setSending] = useState(false);
  const [receiveToken, setReceiveToken] = useState<api.BackupReceiveToken | null>(null);
  const [receiveTokenOpen, setReceiveTokenOpen] = useState(false);
  const [generatingReceiveToken, setGeneratingReceiveToken] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<api.BackupUploadSession | null>(null);
  const [uploading, setUploading] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [resumeHint, setResumeHint] = useState<ResumeState | null>(() => readResumeState());
  const localFileInput = useRef<HTMLInputElement>(null);
  const uploadAbort = useRef<AbortController | null>(null);
  const uploadHashAbort = useRef<AbortController | null>(null);
  const pauseRequested = useRef(false);
  const restoreConfirmationStartedAt = useRef<number | null>(null);

  const pollingActive = routeActive && !restoring;
  const backups = useAdminResource<api.BackupList | null>(api.listBackups, {
    queryKey: "backups", active: pollingActive, initialData: null, onUnauthorized: invalidateSession,
    intervalMs: (data) => {
      if (restoreSubmitting) return 500;
      return taskActive(data?.current) || data?.pendingRestore || data?.restoreProgress ? 2000 : 15_000;
    },
  });
  const outgoing = useAdminResource(api.listBackupTransfers, {
    queryKey: "backup-transfers", active: pollingActive, initialData: [], onUnauthorized: invalidateSession,
    intervalMs: (items) => items.some(transferActive) ? 2000 : 15_000,
  });
  const incoming = useAdminResource(api.listBackupReceiveTransfers, {
    queryKey: "backup-receives", active: pollingActive, initialData: [], onUnauthorized: invalidateSession,
    intervalMs: (items) => items.some(receiveTransferActive) ? 2000 : 15_000,
  });
  const { data, setData, loading } = backups;
  const transfers = outgoing.data;
  const { data: receiveTransfers, setData: setReceiveTransfers } = incoming;

  useEffect(() => {
    if (!resumeHint) return;
    let active = true;
    api
      .getBackupUpload(resumeHint.id)
      .then((session) => {
        if (active) setUpload(session);
      })
      .catch(() => {
        if (!active) return;
        localStorage.removeItem(RESUME_KEY);
        setResumeHint(null);
      });
    return () => {
      active = false;
    };
  }, [resumeHint?.id]);

  useEffect(() => {
    if (!finalizing || !upload?.id) return;
    let active = true;
    let timer = 0;
    const poll = async () => {
      try {
        const session = await api.getBackupUpload(upload.id);
        if (active) setUpload(session);
      } catch {
        // The finalize request owns success and error reporting. A 404 here
        // normally means it just published and removed the upload session.
      }
      if (active) timer = window.setTimeout(poll, 450);
    };
    void poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [finalizing, upload?.id]);

  useEffect(() => {
    if (!restoring) {
      restoreConfirmationStartedAt.current = null;
      return;
    }
    let active = true;
    const startedAt = restoreConfirmationStartedAt.current ?? Date.now();
    restoreConfirmationStartedAt.current = startedAt;
    const redirectToLogin = () => {
      if (!active) return;
      // Restore deliberately clears every server session. Keep the central
      // auth state in sync before LoginPage decides whether to redirect.
      invalidateSession();
      navigate("/login", { replace: true });
    };
    const poll = async () => {
      try {
        const state = await api.me();
        if (active && !state.authenticated) {
          redirectToLogin();
          return;
        }
        if (active && state.authenticated) {
          const backupState = await api.listBackups();
          if (!active) return;
          setData(backupState);
          // A request can lose its response while the service is preparing to
          // restart. Keep confirming while preparation or a pending marker is
          // visible; only report failure after a bounded grace period.
          const restoreInProgress =
            backupState.pendingRestore || Boolean(backupState.restoreProgress);
          if (
            !restoreInProgress &&
            Date.now() - startedAt >= RESTORE_CONFIRMATION_GRACE_MS
          ) {
            setRestoring(false);
            setRestoreReport(null);
            show("未確認恢復已啟動，目前資料保持不變，請重試", "error");
            return;
          }
        }
      } catch (error) {
        if (active && error instanceof api.UnauthorizedError) {
          redirectToLogin();
          return;
        }
      }
      if (active) window.setTimeout(poll, RESTORE_POLL_INTERVAL_MS);
    };
    const timer = window.setTimeout(poll, 1000);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [restoring, navigate, invalidateSession, show]);

  const current = data?.current;
  const sendUsesPlainHTTP = sendURL.trim().toLowerCase().startsWith("http://");
  const progress = useMemo(() => {
    if (!current?.totalBytes) return 0;
    return Math.min(100, Math.max(0, (current.processedBytes / current.totalBytes) * 100));
  }, [current?.processedBytes, current?.totalBytes]);
  const visibleTransfers = useMemo(
    () => visibleProgressTransfers(transfers, transferActive),
    [transfers]
  );
  const visibleReceiveTransfers = useMemo(
    () => visibleProgressTransfers(receiveTransfers, receiveTransferActive),
    [receiveTransfers]
  );

  function handleCreate() {
    setBackupSelection({ ...EMPTY_BACKUP_SELECTION });
    setCreateOpen(true);
  }

  async function handleConfirmCreate() {
    if (!Object.values(backupSelection).some(Boolean)) return;
    setCreating(true);
    try {
      await api.createBackup(backupSelection);
      setCreateOpen(false);
      show("備份任務已開始", "success");
      await backups.invalidate();
    } catch (error) {
      show(error instanceof Error ? error.message : "建立備份失敗", "error");
    } finally {
      setCreating(false);
    }
  }

  function toggleBackupSelection(key: keyof api.BackupSelection) {
    setBackupSelection((currentSelection) => ({
      ...currentSelection,
      [key]: !currentSelection[key],
    }));
  }

  async function handleCancelBackup() {
    try {
      await api.cancelBackup();
      show("正在取消備份任務", "info");
      await backups.invalidate();
    } catch (error) {
      show(error instanceof Error ? error.message : "取消失敗", "error");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteBackup(deleteTarget.id);
      show("備份已刪除", "success");
      setExpandedBackupId((current) => (current === deleteTarget.id ? "" : current));
      setDeleteTarget(null);
      await backups.invalidate();
    } catch (error) {
      show(error instanceof Error ? error.message : "刪除備份失敗", "error");
    } finally {
      setDeleting(false);
    }
  }

  async function handleCreateReceiveToken() {
    setGeneratingReceiveToken(true);
    try {
      const created = await api.createBackupReceiveToken();
      setReceiveToken(created);
      setReceiveTokenOpen(true);
    } catch (error) {
      show(error instanceof Error ? error.message : "生成伺服器接收碼失敗", "error");
    } finally {
      setGeneratingReceiveToken(false);
    }
  }

  async function handleCopyReceiveToken() {
    if (!receiveToken) return;
    const copied = await copyTextToClipboard(receiveToken.token);
    show(copied ? "接收碼已複製" : "複製失敗，請手動複製", copied ? "success" : "error");
  }

  async function handleSendBackup() {
    if (!sendTarget || sending) return;
    setSending(true);
    try {
      await api.createBackupTransfer(sendTarget.id, {
        targetUrl: sendURL.trim(),
        receiveToken: sendToken.trim(),
      });
      setSendTarget(null);
      setSendURL("");
      setSendToken("");
      show("伺服器發送任務已建立", "success");
      await outgoing.invalidate();
    } catch (error) {
      show(error instanceof Error ? error.message : "建立伺服器發送任務失敗", "error");
    } finally {
      setSending(false);
    }
  }

  async function handleCancelTransfer(id: string) {
    try {
      await api.cancelBackupTransfer(id);
      show("正在取消伺服器發送任務", "info");
      await outgoing.invalidate();
    } catch (error) {
      show(error instanceof Error ? error.message : "取消伺服器發送失敗", "error");
    }
  }

  async function handleCancelReceiveTransfer(id: string) {
    if (cancelingReceiveIds.has(id)) return;
    setCancelingReceiveIds((current) => new Set(current).add(id));
    try {
      await api.cancelBackupReceiveTransfer(id);
      setReceiveTransfers((current) =>
        current.map((transfer) =>
          transfer.id === id
            ? { ...transfer, state: "canceled", cancellable: false }
            : transfer
        )
      );
      show("伺服器接收已取消，臨時檔案正在清理", "success");
      await incoming.invalidate();
    } catch (error) {
      show(error instanceof Error ? error.message : "取消伺服器接收失敗", "error");
    } finally {
      setCancelingReceiveIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  async function handleRetryTransfer(id: string) {
    try {
      await api.retryBackupTransfer(id);
      show("伺服器發送任務已重新排隊", "success");
      await outgoing.invalidate();
    } catch (error) {
      show(error instanceof Error ? error.message : "重試伺服器發送失敗", "error");
    }
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    event.currentTarget.value = "";
    setFile(next);
    if (!next) return;
    const hint = readResumeState();
    if (hint && (hint.fileName !== next.name || hint.size !== next.size)) {
      setUpload(null);
    }
    void handleUpload(next);
  }

  function handleLocalUploadEntry() {
    if (!data || uploading || finalizing) return;
    if (file && upload) {
      void handleUpload(file);
      return;
    }
    localFileInput.current?.click();
  }

  async function ensureUploadSession(selected: File) {
    const hint = readResumeState();
    if (
      hint &&
      hint.fileName === selected.name &&
      hint.size === selected.size &&
      hint.lastModified === selected.lastModified
    ) {
      try {
        const existing = await api.getBackupUpload(hint.id);
        setUpload(existing);
        return existing;
      } catch {
        localStorage.removeItem(RESUME_KEY);
        setResumeHint(null);
      }
    }
    const created = await api.beginBackupUpload({
      fileName: selected.name,
      size: selected.size,
    });
    const saved: ResumeState = {
      id: created.id,
      fileName: selected.name,
      size: selected.size,
      lastModified: selected.lastModified,
    };
    localStorage.setItem(RESUME_KEY, JSON.stringify(saved));
    setResumeHint(saved);
    setUpload(created);
    return created;
  }

  async function handleUpload(selectedFile: File | null = file) {
    if (!selectedFile || uploading || finalizing) return;
    setUploading(true);
    pauseRequested.current = false;
    const hashController = new AbortController();
    uploadHashAbort.current = hashController;
    const archiveHashPromise = sha256Blob(selectedFile, hashController.signal);
    void archiveHashPromise.catch(() => undefined);
    try {
      let session = await ensureUploadSession(selectedFile);
      const received = new Set(session.received.map((chunk) => chunk.index));
      for (let index = 0; index < session.totalChunks; index += 1) {
        if (received.has(index)) continue;
        if (pauseRequested.current) return;
        const start = index * session.chunkSize;
        const end = Math.min(selectedFile.size, start + session.chunkSize);
        const blob = selectedFile.slice(start, end);
        let lastError: unknown;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          if (pauseRequested.current) return;
          const controller = new AbortController();
          uploadAbort.current = controller;
          try {
            session = await api.putBackupUploadChunk(
              session.id,
              index,
              blob,
              controller.signal
            );
            setUpload(session);
            lastError = undefined;
            break;
          } catch (error) {
            lastError = error;
            if (pauseRequested.current || controller.signal.aborted) return;
            if (attempt < 2) await delay(500 * (attempt + 1));
          }
        }
        if (lastError) throw lastError;
      }
      const archiveHash = await archiveHashPromise;
      if (pauseRequested.current) return;
      setUpload({
        ...session,
        state: "finalizing",
        progress: {
          phase: "preparing",
          processedBytes: 0,
          totalBytes: session.size,
          processedFiles: 0,
          totalFiles: session.totalChunks,
        },
      });
      setFinalizing(true);
      const completed = await api.finalizeBackupUpload(session.id, archiveHash);
      localStorage.removeItem(RESUME_KEY);
      setResumeHint(null);
      setUpload(null);
      setFile(null);
      show(`遷移備份 ${completed.name} 已完成校驗`, "success");
      await backups.invalidate();
    } catch (error) {
      if (pauseRequested.current) return;
      show(error instanceof Error ? error.message : "遷移上傳失敗，可稍後重試", "error");
    } finally {
      hashController.abort();
      if (uploadHashAbort.current === hashController) {
        uploadHashAbort.current = null;
      }
      uploadAbort.current = null;
      setUploading(false);
      setFinalizing(false);
    }
  }

  function handlePause() {
    pauseRequested.current = true;
    uploadAbort.current?.abort();
    uploadHashAbort.current?.abort();
    setUploading(false);
    show("上傳已暫停，已完成分片會保留 72 小時", "info");
  }

  async function handleCancelUpload() {
    if (!upload) return;
    pauseRequested.current = true;
    uploadAbort.current?.abort();
    uploadHashAbort.current?.abort();
    try {
      await api.cancelBackupUpload(upload.id);
      localStorage.removeItem(RESUME_KEY);
      setResumeHint(null);
      setUpload(null);
      setFile(null);
      show("遷移上傳已取消並清理", "success");
    } catch (error) {
      show(error instanceof Error ? error.message : "取消上傳失敗", "error");
    }
  }

  async function handleRestore() {
    if (!restoreTarget || restoreSubmitting || restoring) return;
    setData((currentData) =>
      currentData ? { ...currentData, restoreProgress: undefined } : currentData
    );
    setRestoreSubmitting(true);
    try {
      const result = await api.restoreBackup(restoreTarget.id, {
        confirmation: restoreText,
      });
      setRestartManaged(result.restartManaged);
      setRestoreReport(result.report);
      setRestoreTarget(null);
      setRestoreText("");
      restoreConfirmationStartedAt.current = Date.now();
      setRestoring(true);
      show("恢復已通過校驗，服務正在切換資料並重啟", "success");
    } catch (error) {
      if (shouldConfirmRestoreAfterTransportError(error)) {
        // The server may already have staged the restore and restarted before
        // the browser received its acknowledgement. Confirm the durable state
        // instead of falsely reporting a failed restore.
        setRestoreTarget(null);
        setRestoreText("");
        restoreConfirmationStartedAt.current = Date.now();
        setRestoring(true);
        show("連接暫時中斷，正在確認恢復狀態", "success");
      } else {
        show(error instanceof Error ? error.message : "恢復失敗", "error");
      }
    } finally {
      setRestoreSubmitting(false);
    }
  }

  function closeRestore() {
    if (restoreSubmitting || restoring) return;
    setRestoreTarget(null);
    setRestoreText("");
  }

  const estimate = data?.estimate;
  const receivedBytes =
    upload?.received.reduce((sum, chunk) => sum + chunk.size, 0) ?? 0;
  const uploadPercent = upload?.size ? Math.min(100, (receivedBytes / upload.size) * 100) : 0;
  const uploadFinalizeIndex = uploadFinalizeStepIndex(upload?.progress?.phase);
  const uploadActiveProgress =
    upload?.progress?.phase === "hashing" || upload?.progress?.phase === "verifying-archive"
      ? upload.progress
      : undefined;
  const uploadFinalizeSteps: ChecklistStep[] = [
    {
      title: "分片寫入暫存檔案",
      state: "done",
    },
    {
      title: "校驗完整檔案",
      state: checklistState(1, uploadFinalizeIndex),
    },
    {
      title: "校驗備份內容",
      state: checklistState(2, uploadFinalizeIndex),
    },
    {
      title: "原子入庫",
      state: checklistState(3, uploadFinalizeIndex),
    },
  ];
  const restoreProgress = data?.restoreProgress;
  const restoreActiveProgress = restoreProgress?.phase === "extracting" ? restoreProgress : undefined;
  const restoreReady = restoreProgress?.phase === "ready";
  const restorePrepareIndex = restorePrepareStepIndex(restoreProgress?.phase);
  const restorePrepareSteps: ChecklistStep[] = [
    {
      title: "讀取歸檔清單",
      state: checklistState(0, restorePrepareIndex, restoreReady),
    },
    {
      title: "校驗並解壓暫存",
      state: checklistState(1, restorePrepareIndex, restoreReady),
    },
    {
      title: "檢查暫存資料庫",
      state: checklistState(2, restorePrepareIndex, restoreReady),
    },
    {
      title: "適配本機執行資料",
      state: checklistState(3, restorePrepareIndex, restoreReady),
    },
    {
      title: "準備原子切換",
      state: checklistState(4, restorePrepareIndex, restoreReady),
    },
  ];
  const restoreWarnings = [
    ...(restoreReport?.localStorageWarnings ?? []),
    ...(restoreReport?.missingAssets ?? []),
    ...(restoreReport?.warnings ?? []),
  ];

  return (
    <div
      ref={floatingActionPageRef}
      className="admin-page admin-page--with-floating-actions backup-page"
      aria-busy={loading || undefined}
    >
      {[
        { title: "備份列表", resource: backups },
        { title: "發送任務", resource: outgoing },
        { title: "接收任務", resource: incoming },
      ].map(({ title, resource }) => resource.error && !restoring && (
        <div className="admin-detail-error" role="alert" key={title}>
          {title}更新失敗：{resource.error}
          <button type="button" className="admin-btn" onClick={() => void resource.refresh()}>重試</button>
        </div>
      ))}
      <section className="backup-overview" aria-label="備份空間概覽">
        <div className="backup-stat">
          <span>預計資料量</span>
          <strong>{data ? formatBytes(estimate?.totalBytes) : null}</strong>
        </div>
        <div className="backup-stat">
          <span>伺服器可用空間</span>
          <strong>{data ? formatBytes(estimate?.availableBytes) : null}</strong>
        </div>
        <div className="backup-stat">
          <span>備份數量</span>
          <strong>{data ? data.backups.length : null}</strong>
        </div>
      </section>

      {current && taskActive(current) && (
        <section className={`backup-task ${current.state === "failed" ? "is-error" : ""}`}>
          <div className="backup-task__head">
            <div className="backup-task__title">
              <strong>{taskPhase(current.phase)}</strong>
            </div>
          </div>
          <div className="backup-task__progress-row">
            <div className="backup-task__meta">
              <span>
                {current.processedFiles}/{current.fileCount} 檔案 · {formatBytes(current.processedBytes)} /{" "}
                {formatBytes(current.totalBytes)} · {formatBytes(current.bytesPerSecond)}/s
              </span>
            </div>
            <strong className="backup-task__percent">{progress.toFixed(1)}%</strong>
            {taskActive(current) && current.cancellable && (
              <button
                type="button"
                className="admin-btn is-transparent"
                onClick={handleCancelBackup}
              >
                取消
              </button>
            )}
          </div>
          <div
            className="backup-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
          {current.error && <p className="backup-task__error">{current.error}</p>}
        </section>
      )}

      {visibleReceiveTransfers.length > 0 && (
        <section className="backup-transfer-list" aria-label="伺服器接收任務">
          <div className="backup-section-heading">
            <h2>伺服器接收</h2>
          </div>
          {visibleReceiveTransfers.map((transfer) => {
            const percent = transfer.size
              ? Math.min(100, Math.max(0, (transfer.processedBytes / transfer.size) * 100))
              : 0;
            return (
              <article
                className={`backup-transfer ${transfer.state === "failed" ? "is-error" : ""}`}
                key={transfer.id}
              >
                <div className="backup-transfer__head">
                  <div>
                    <strong>{receiveTransferStateLabel(transfer.state)}</strong>
                    <span>
                      {transfer.backupName} · 來源 {transfer.sourceServerId.slice(0, 12)}
                    </span>
                  </div>
                  {transfer.cancellable && (
                    <div className="backup-transfer__actions">
                      <button
                        type="button"
                        className="admin-btn is-transparent"
                        onClick={() => handleCancelReceiveTransfer(transfer.id)}
                        disabled={cancelingReceiveIds.has(transfer.id)}
                      >
                        {cancelingReceiveIds.has(transfer.id) ? "取消中..." : "取消"}
                      </button>
                    </div>
                  )}
                </div>
                <div className="backup-transfer__meta">
                  <span>
                    {formatBytes(transfer.processedBytes)} / {formatBytes(transfer.size)}
                    {transfer.state === "uploading" && (
                      <> · 下載 {formatBytes(transfer.bytesPerSecond)}/s</>
                    )}
                  </span>
                  <strong>{percent.toFixed(1)}%</strong>
                </div>
                <div
                  className="backup-progress"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(percent)}
                >
                  <span style={{ width: `${percent}%` }} />
                </div>
                {transfer.error && <p className="backup-task__error">{transfer.error}</p>}
              </article>
            );
          })}
        </section>
      )}

      {visibleTransfers.length > 0 && (
        <section className="backup-transfer-list" aria-label="伺服器發送任務">
          <div className="backup-section-heading">
            <h2>伺服器發送</h2>
          </div>
          {visibleTransfers.map((transfer) => {
            const percent = transfer.size
              ? Math.min(100, Math.max(0, (transfer.processedBytes / transfer.size) * 100))
              : 0;
            return (
              <article
                className={`backup-transfer ${transfer.state === "failed" ? "is-error" : ""}`}
                key={transfer.id}
              >
                <div className="backup-transfer__head">
                  <div>
                    <strong>{transferStateLabel(transfer.state)}</strong>
                    <span>{transfer.backupName} → {transfer.targetUrl}</span>
                  </div>
                  <div className="backup-transfer__actions">
                    {transfer.cancellable && transferActive(transfer) && (
                      <button
                        type="button"
                        className="admin-btn is-transparent"
                        onClick={() => handleCancelTransfer(transfer.id)}
                      >
                        取消
                      </button>
                    )}
                    {transfer.retryable && (
                      <button
                        type="button"
                        className="admin-btn is-transparent"
                        onClick={() => handleRetryTransfer(transfer.id)}
                      >
                        重試
                      </button>
                    )}
                  </div>
                </div>
                <div className="backup-transfer__meta">
                  <span>
                    {formatBytes(transfer.processedBytes)} / {formatBytes(transfer.size)}
                    {transfer.state === "uploading" && (
                      <> · 上傳 {formatBytes(transfer.bytesPerSecond)}/s</>
                    )}
                  </span>
                  <strong>{percent.toFixed(1)}%</strong>
                </div>
                <div
                  className="backup-progress"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(percent)}
                >
                  <span style={{ width: `${percent}%` }} />
                </div>
                {transfer.error && <p className="backup-task__error">{transfer.error}</p>}
              </article>
            );
          })}
        </section>
      )}

      <div className="backup-grid">
        <section className="admin-card backup-upload-card">
          <div className="backup-section-heading">
            <h2>上傳備份包</h2>
          </div>
          <div className="backup-upload-entry-actions">
            <button
              type="button"
              className="admin-btn"
              onClick={handleCreateReceiveToken}
              disabled={!data || generatingReceiveToken}
            >
              {generatingReceiveToken ? (
                <Loader2 size={14} className="admin-spin" />
              ) : (
                <ServerIcon size={14} />
              )}
              從伺服器接收
            </button>
            <button
              type="button"
              className="admin-btn"
              onClick={handleLocalUploadEntry}
              disabled={!data || uploading || finalizing}
              title={
                resumeHint
                  ? `檢測到未完成上傳：${resumeHint.fileName}，重新選擇同一檔案繼續`
                  : undefined
              }
            >
              <FileIcon size={14} />
              從本機上傳
            </button>
            <input
              ref={localFileInput}
              type="file"
              accept=".zip,application/zip"
              onChange={chooseFile}
              disabled={!data || uploading || finalizing}
              hidden
            />
          </div>
          {(uploading || upload) && !finalizing ? (
            <div className="backup-upload-actions">
              {uploading ? (
                <button type="button" className="admin-btn" onClick={handlePause}>
                  暫停
                </button>
              ) : null}
              {upload && (
                <button
                  type="button"
                  className="admin-btn"
                  onClick={handleCancelUpload}
                  disabled={finalizing}
                >
                  取消
                </button>
              )}
            </div>
          ) : null}
          {upload && finalizing ? (
            <BackupOperationChecklist
              title="校驗並入庫"
              steps={uploadFinalizeSteps}
              progress={uploadActiveProgress}
            />
          ) : upload ? (
            <div className="backup-upload-progress">
              <div className="backup-progress">
                <span style={{ width: `${uploadPercent}%` }} />
              </div>
              <div className="backup-upload-progress__meta">
                <span>
                  {upload.received.length}/{upload.totalChunks} 分片 · {formatBytes(receivedBytes)} /{" "}
                  {formatBytes(upload.size)} · {uploading ? "上傳中" : "已暫停"}
                </span>
              </div>
            </div>
          ) : null}
        </section>

        <section className="backup-list-section">
          {data?.backups.length ? (
            <div className="backup-list">
              {data.backups.map((record) => {
                const scopeLabels = backupSelectionLabels(record.selection);
                const expanded = expandedBackupId === record.id;
                return (
                  <article
                    className={`backup-record${expanded ? " is-expanded" : ""}`}
                    key={record.id}
                  >
                    <div className="backup-record__line">
                      <button
                        type="button"
                        className="backup-record__main"
                        onClick={() => setExpandedBackupId((current) => (
                          current === record.id ? "" : record.id
                        ))}
                        aria-expanded={expanded}
                        title={expanded ? "收起備份內容" : "展開備份內容"}
                      >
                        <span className="backup-record__icon">
                          <Archive size={21} />
                        </span>
                        <span className="backup-record__body">
                          <span className="backup-record__name">{record.name}</span>
                          <span className="backup-record__meta">
                            <span>{formatBytes(record.size)}</span>
                            <span>{formatTime(record.createdAt)}</span>
                            {record.imported && <span className="backup-badge">遷移</span>}
                            <span className={`backup-verify is-${record.verificationStatus}`}>
                              {record.verificationStatus === "verified"
                                ? "已校驗"
                                : record.verificationStatus === "invalid"
                                  ? "校驗失敗"
                                  : "待校驗"}
                            </span>
                            <span className="backup-record__scope-trigger">
                              {scopeLabels.length} 項備份內容
                              <ChevronDown size={14} aria-hidden="true" />
                            </span>
                          </span>
                          {record.verificationError && (
                            <span className="backup-record__error">{record.verificationError}</span>
                          )}
                        </span>
                      </button>
                      <div className="backup-record__actions">
                        <a className="admin-btn" href={api.backupDownloadURL(record.id)}>
                          下載
                        </a>
                        <button
                          type="button"
                          className="admin-btn"
                          onClick={() => {
                            setSendTarget(record);
                            setSendURL("");
                            setSendToken("");
                          }}
                          disabled={
                            record.verificationStatus !== "verified" ||
                            data.pendingRestore ||
                            transfers.some(transferActive)
                          }
                        >
                          發送
                        </button>
                        <button
                          type="button"
                          className="admin-btn"
                          onClick={() => {
                            setRestoreReport(null);
                            setRestoreTarget(record);
                          }}
                          disabled={record.verificationStatus === "invalid" || data.pendingRestore}
                        >
                          恢復
                        </button>
                        <button
                          type="button"
                          className="admin-btn is-danger"
                          onClick={() => setDeleteTarget(record)}
                          disabled={data.pendingRestore}
                        >
                          刪除
                        </button>
                      </div>
                    </div>
                    {expanded && (
                      <div className="backup-record__detail" aria-label="備份內容">
                        <span className="backup-record__detail-title">備份內容</span>
                        <div className="backup-record__detail-scopes">
                          {scopeLabels.map((label) => (
                            <span className="backup-record__detail-scope" key={label}>
                              <Check size={14} aria-hidden="true" />
                              <span>{label}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : data ? (
            <div className="backup-empty">
              <Archive size={28} />
              <span>目前沒有備份包</span>
            </div>
          ) : null}
        </section>
      </div>

      <button
        data-admin-floating-actions
        type="button"
        className="admin-btn admin-create-fab"
        onClick={handleCreate}
        disabled={!data || creating || taskActive(current) || data.pendingRestore}
      >
        <Plus size="1em" aria-hidden="true" />
        建立備份
      </button>

      <ConfirmModal
        open={deleteTarget !== null}
        title="刪除備份"
        message={`確定要永久刪除「${deleteTarget?.name ?? ""}」嗎？`}
        danger
        hideIcon
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />

      <Modal
        open={createOpen}
        title="選擇備份內容"
        className="admin-modal--backup-create"
        onClose={() => {
          if (!creating) setCreateOpen(false);
        }}
        footer={
          <>
            <button
              type="button"
              className="admin-btn"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              取消
            </button>
            <button
              type="button"
              className="admin-btn"
              onClick={handleConfirmCreate}
              disabled={creating || !Object.values(backupSelection).some(Boolean)}
            >
              {creating ? <Loader2 size={14} className="admin-spin" /> : null}
              確認
            </button>
          </>
        }
      >
        <fieldset className="backup-selection-list" aria-label="備份內容">
          {BACKUP_SELECTION_OPTIONS.map((option) => (
            <label className="backup-selection-option" key={option.key}>
              <input
                type="checkbox"
                checked={backupSelection[option.key]}
                onChange={() => toggleBackupSelection(option.key)}
                disabled={creating}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>
      </Modal>

      <Modal
        open={sendTarget !== null}
        title="發送到其它伺服器"
        className="admin-modal--backup-transfer"
        onClose={() => {
          if (sending) return;
          setSendTarget(null);
          setSendURL("");
          setSendToken("");
        }}
        footer={
          <>
            <button
              type="button"
              className="admin-btn"
              disabled={sending}
              onClick={() => {
                setSendTarget(null);
                setSendURL("");
                setSendToken("");
              }}
            >
              取消
            </button>
            <button
              type="button"
              className="admin-btn"
              disabled={sending || !sendURL.trim() || !sendToken.trim()}
              onClick={handleSendBackup}
            >
              確認
            </button>
          </>
        }
      >
        <div className="backup-transfer-form">
          <div className="backup-transfer-summary">
            <Archive size={18} />
            <div>
              <strong>{sendTarget?.name}</strong>
              <span>{formatBytes(sendTarget?.size)}</span>
            </div>
          </div>
          <label className="backup-field">
            <span>目標伺服器地址</span>
            <input
              className="admin-input"
              type="url"
              value={sendURL}
              onChange={(event) => setSendURL(event.target.value)}
              placeholder="http://192.168.1.10:9191 或 https://target.example.com"
              autoComplete="url"
              disabled={sending}
            />
          </label>
          {sendUsesPlainHTTP ? (
            <p className="backup-transfer-transport-warning" role="alert">
              <CircleAlert size={16} />
              <span>
                HTTP 會明文傳輸接收碼和完整備份包，請確認兩臺伺服器之間的網路鏈路可信
              </span>
            </p>
          ) : null}
          <label className="backup-field">
            <span>目標伺服器接收碼</span>
            <textarea
              className="admin-input backup-transfer-token-input"
              value={sendToken}
              onChange={(event) => setSendToken(event.target.value)}
              placeholder="在目標伺服器的備份頁面生成並粘貼到這里"
              autoComplete="off"
              spellCheck={false}
              disabled={sending}
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={receiveTokenOpen}
        title="從其它伺服器接收"
        className="admin-modal--backup-transfer"
        onClose={() => {
          setReceiveTokenOpen(false);
          setReceiveToken(null);
        }}
      >
        <div className="backup-receive-code">
          <p>將這個一次性接收碼給到發送方</p>
          <span className="backup-receive-code__expiry">
            目前接收碼有效至 {formatTime(receiveToken?.expiresAt)}，一個接收碼只展示一次
          </span>
          <div className="backup-receive-code__value">
            <code>{receiveToken?.token}</code>
            <button
              type="button"
              className="admin-btn"
              onClick={handleCopyReceiveToken}
              disabled={!receiveToken}
            >
              <Copy size={14} />
              複製
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={restoreTarget !== null || restoring}
        title={restoring ? "應用恢復並重啟服務" : "確認恢復"}
        className="admin-modal--backup-restore"
        onClose={closeRestore}
        footer={
          restoring ? undefined : (
            <>
              <button
                type="button"
                className="admin-btn"
                disabled={restoreSubmitting}
                onClick={closeRestore}
              >
                取消
              </button>
              <button
                type="button"
                className="admin-btn is-danger"
                disabled={restoreText !== "确认恢复" || restoreSubmitting}
                onClick={handleRestore}
              >
                {restoreSubmitting ? <Loader2 size={14} className="admin-spin" /> : null}
                確認
              </button>
            </>
          )
        }
      >
        {restoreTarget && restoreSubmitting ? (
          <BackupOperationChecklist
            title="恢復中"
            steps={restorePrepareSteps}
            progress={restoreActiveProgress}
          />
        ) : restoring ? (
          <>
            <BackupOperationChecklist
              title="應用恢復並重啟服務"
              steps={[
                {
                  title: "校驗並暫存備份資料",
                  state: "done",
                },
                {
                  title: "準備可回滾切換",
                  state: "done",
                },
                {
                  title: "切換持久資料",
                  state: "active",
                },
                {
                  title: "重啟並重新登入",
                  state: "pending",
                },
              ]}
            />
            <span className="sr-only">
              {restartManaged ? "服務完成後返回登入頁" : "請手動重啟後端，頁面會繼續檢測"}；
              {restoreWarnings.slice(0, 6).join("；")}
            </span>
          </>
        ) : restoreTarget ? (
          <div className="backup-restore-form">
            <div className="backup-restore-warning">
              <CircleAlert size={18} />
              <span>恢復所選內容並重啟</span>
            </div>
            <dl className="backup-restore-summary">
              <div>
                <dt>來源版本</dt>
                <dd>{restoreTarget.appVersion || "unknown"}</dd>
              </div>
              <div>
                <dt>建立時間</dt>
                <dd>{formatTime(restoreTarget.createdAt)}</dd>
              </div>
              <div>
                <dt>校驗狀態</dt>
                <dd>
                  {restoreTarget.verificationStatus === "verified"
                    ? "已完整校驗"
                    : "恢復前將重新完整校驗"}
                </dd>
              </div>
              <div className="backup-restore-summary__scope">
                <dt>恢復內容</dt>
                <dd>
                  <span className="backup-scope-list">
                    {backupSelectionLabels(restoreTarget.selection).map((label) => (
                      <span className="backup-scope" key={label}>{label}</span>
                    ))}
                  </span>
                </dd>
              </div>
            </dl>
            <label className="backup-field">
              <span>輸入“確認恢復”</span>
              <input
                className="admin-input"
                value={restoreText}
                onChange={(event) => setRestoreText(event.target.value)}
                placeholder="確認恢復"
                autoComplete="off"
              />
            </label>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}
