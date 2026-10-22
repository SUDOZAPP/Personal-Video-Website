import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  CheckCircle2,
  ChevronDown,
  Link2,
  LoaderCircle,
  Play,
  Plus,
  Upload,
} from "lucide-react";
import * as api from "./api";
import { editorFormFromCrawler, editorFormWithImportedScript, type CrawlerEditorForm } from "./crawlerEditor";
import { Modal } from "./Modal";
import { ConfirmModal } from "./ConfirmModal";
import { useToast } from "@/components/ToastContext";
import { CrawlerUploadTargetField } from "./drive/CrawlerUploadTargetField";
import { SpiderIcon } from "./icons/SpiderIcon";
import { ScriptFileIcon } from "./icons/ScriptFileIcon";
import { AdminEmptyVisual } from "./AdminEmptyVisual";
import { CrawlerListSkeleton } from "./CrawlersPageLoading";
import {
  crawlerActionReasons,
  crawlerActivity,
  crawlerBusy,
  crawlerCrawlStatus,
  crawlerGenerationStatus,
  crawlerTestSummary,
  crawlerUploadResult,
  crawlerUploadStatus,
  type CrawlerAction,
  type CrawlerDisplayStatus,
} from "./crawlerStatus";
import { useAdminFloatingActionSpace } from "./useAdminFloatingActionSpace";
import { useAdminRouteActive } from "./AdminRouteCache";
import { useAdminResource } from "./useAdminResource";
import { useAuth } from "./AuthContext";

const POLL_INTERVAL_MS = 5000;

export function CrawlersPage() {
  const floatingActionPageRef = useAdminFloatingActionSpace<HTMLElement>();
  const routeActive = useAdminRouteActive();
  const { invalidateSession } = useAuth();
  const maintenance = useAdminResource<api.MaintenanceJobStatus | null>(api.getScanAllJobStatus,
    { queryKey: "maintenance", active: routeActive, initialData: null, onUnauthorized: invalidateSession,
      intervalMs: (status) => status?.running || status?.queued ? POLL_INTERVAL_MS : 15_000 });
  const maintenanceBusy = Boolean(maintenance.data?.running || maintenance.data?.queued);
  const crawlers = useAdminResource(api.listCrawlers, {
    queryKey: "crawlers", active: routeActive, initialData: [], onUnauthorized: invalidateSession,
    intervalMs: (items) => maintenanceBusy || items.some(crawlerBusy) ? POLL_INTERVAL_MS : 15_000,
  });
  const drives = useAdminResource(api.listDrives, { queryKey: "crawler-upload-targets", active: routeActive, intervalMs: null, initialData: [], onUnauthorized: invalidateSession });
  const { data: list, setData: setList, loading, invalidate: refresh } = crawlers;
  const uploadTargets = drives.data.filter((drive) => drive.canUpload);
  const [detailTargetId, setDetailTargetId] = useState("");
  const [pendingActions, setPendingActions] = useState<Record<string, CrawlerAction>>({});
  const pendingActionsRef = useRef<Record<string, CrawlerAction>>({});
  // undefined = 编辑器关闭；null = 新建；其余 = 编辑已有爬虫
  const [editorTarget, setEditorTarget] = useState<api.AdminCrawler | null | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<api.AdminCrawler | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { show } = useToast();

  function beginAction(id: string, action: CrawlerAction) {
    if (pendingActionsRef.current[id]) return false;
    pendingActionsRef.current = { ...pendingActionsRef.current, [id]: action };
    setPendingActions(pendingActionsRef.current);
    return true;
  }

  function finishAction(id: string) {
    const next = { ...pendingActionsRef.current };
    delete next[id];
    pendingActionsRef.current = next;
    setPendingActions(next);
  }

  function actionReasons(crawler: api.AdminCrawler) {
    return crawlerActionReasons(crawler, {
      pending: pendingActionsRef.current[crawler.id],
      maintenanceBusy,
      uploadTargetAvailable: uploadTargets.some(target => target.id === crawler.uploadDriveId),
    });
  }

  async function run(crawler: api.AdminCrawler) {
    const reason = actionReasons(crawler).run;
    if (reason) {
      show(reason, "info");
      return;
    }
    if (!beginAction(crawler.id, "run")) return;
    try {
      const resp = await api.runCrawler(crawler.id);
      if (!resp.accepted) {
        show(resp.message || "目前爬蟲有正在進行的任務", "info");
        return;
      }
      show("已觸發抓取任務", "success");
    } catch (e) {
      show(e instanceof Error ? e.message : "觸發失敗", "error");
    } finally {
      await refresh();
      finishAction(crawler.id);
    }
  }

  async function uploadVideos(crawler: api.AdminCrawler) {
    const reason = actionReasons(crawler).upload;
    if (reason) {
      show(reason, "info");
      return;
    }
    if (!beginAction(crawler.id, "upload")) return;
    try {
      if (crawler.localVideoCount === 0) {
        show("目前沒有需要上傳的影片", "info");
        return;
      }
      const resp = await api.uploadCrawlerVideos(crawler.id);
      if (!resp.accepted) {
        show(resp.message || "目前爬蟲暫不滿足上傳條件", "info");
        return;
      }
      show("已觸發目前爬蟲的上傳任務", "success");
    } catch (e) {
      show(e instanceof Error ? e.message : "觸發上傳失敗", "error");
    } finally {
      await refresh();
      finishAction(crawler.id);
    }
  }

  async function stop(crawler: api.AdminCrawler) {
    if (!beginAction(crawler.id, "stop")) return;
    try {
      const resp = await api.stopCrawlerTasks(crawler.id);
      const hasCrawlTask = crawler.currentTask?.state === "queued" || crawler.currentTask?.state === "running";
      show(resp.stopped
        ? hasCrawlTask ? "已暫停抓取" : "已請求停止任務"
        : "目前沒有可停止任務", "info");
    } catch (e) {
      show(e instanceof Error ? e.message : "停止失敗", "error");
    } finally {
      await refresh();
      finishAction(crawler.id);
    }
  }

  async function togglePaused(crawler: api.AdminCrawler) {
    if (!beginAction(crawler.id, "pause")) return;
    const next = !crawler.paused;
    setList((prev) => prev.map((item) => (item.id === crawler.id ? { ...item, paused: next } : item)));
    try {
      await api.setCrawlerPaused(crawler.id, next);
      show(next ? "已暫停該爬蟲的凌晨抓取" : "已恢復該爬蟲的凌晨抓取", "success");
    } catch (e) {
      setList(prev => prev.map(item => item.id === crawler.id ? { ...item, paused: crawler.paused } : item));
      show(e instanceof Error ? e.message : "切換暫停狀態失敗", "error");
    } finally {
      await refresh();
      finishAction(crawler.id);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const resp = await api.deleteCrawler(deleteTarget.id);
      if (resp.warning) {
        show(`已刪除爬蟲設定，但腳本檔案清理失敗：${resp.warning}`, "error");
      } else {
        show(`已刪除爬蟲，並清理 ${resp.deletedVideos} 個本機影片`, "success");
      }
      setDeleteTarget(null);
      if (detailTargetId === deleteTarget.id) setDetailTargetId("");
      await refresh();
    } catch (e) {
      show(e instanceof Error ? e.message : "刪除失敗", "error");
    } finally {
      setDeleting(false);
    }
  }


  return (
    <section
      ref={floatingActionPageRef}
      className="admin-page admin-page--with-floating-actions admin-crawlers-page"
    >
      {[
        { title: "爬蟲列表", resource: crawlers },
        { title: "上傳目標", resource: drives },
        { title: "維護狀態", resource: maintenance },
      ].map(({ title, resource }) => resource.error && (
        <div className="admin-detail-error" role="alert" key={title}>
          {title}更新失敗：{resource.error}
          <button type="button" className="admin-btn" onClick={() => void resource.refresh()}>重試</button>
        </div>
      ))}
      <div className="admin-crawler-console">
        <div
          className="admin-card admin-crawler-list"
          aria-busy={loading || undefined}
        >
          {loading ? (
            <CrawlerListSkeleton />
          ) : crawlers.error && list.length === 0 ? null : list.length === 0 ? (
            <AdminEmptyVisual
              variant="empty"
              text="暫無爬蟲"
              className="admin-crawler-empty"
            />
          ) : (
            <div className="admin-crawler-table">
              {list.map((crawler) => (
                <CrawlerRow
                  key={crawler.id}
                  crawler={crawler}
                  expanded={detailTargetId === crawler.id}
                  pendingAction={pendingActions[crawler.id]}
                  onToggleOpen={() => setDetailTargetId((current) => (current === crawler.id ? "" : crawler.id))}
                  onRun={() => run(crawler)}
                  onUpload={() => uploadVideos(crawler)}
                  onStop={() => stop(crawler)}
                  onEdit={() => {
                    setDetailTargetId("");
                    setEditorTarget(crawler);
                  }}
                  onDelete={() => {
                    setDetailTargetId("");
                    setDeleteTarget(crawler);
                  }}
                  onTogglePaused={() => togglePaused(crawler)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <button
        data-admin-floating-actions
        type="button"
        className="admin-btn admin-create-fab"
        onClick={() => setEditorTarget(null)}
      >
        <Plus size="1em" aria-hidden="true" />
        新增爬蟲
      </button>

      {editorTarget !== undefined && (
        <CrawlerEditorModal
          key={editorTarget?.id ?? "new"}
          open
          crawler={editorTarget}
          uploadTargets={uploadTargets}
          onClose={() => setEditorTarget(undefined)}
          onSaved={() => {
            setEditorTarget(undefined);
            void refresh();
          }}
        />
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        title="刪除爬蟲"
        message={`確定刪除爬蟲「${deleteTarget?.name ?? ""}」？正在執行的任務將先自動停止；退出後，本機保留的影片、封面、預覽和抓取檔案將一並刪除，已遷移到雲端硬碟的影片不受影響。`}
        plainConfirm
        hideIcon
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </section>
  );
}

function CrawlerRow({
  crawler,
  expanded,
  pendingAction,
  onToggleOpen,
  onRun,
  onUpload,
  onStop,
  onEdit,
  onDelete,
  onTogglePaused,
}: {
  crawler: api.AdminCrawler;
  expanded: boolean;
  pendingAction?: CrawlerAction;
  onToggleOpen: () => void;
  onRun: () => void;
  onUpload: () => void;
  onStop: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePaused: () => void;
}) {
  const activity = pendingAction === "run" || pendingAction === "upload" || pendingAction === "stop"
    ? { text: "處理中", tone: "generating" } : crawlerActivity(crawler);
  return (
    <div className={`admin-crawler-row ${expanded ? "is-expanded" : ""}`}>
      <div className="admin-crawler-row__line">
        <button type="button" className="admin-crawler-row__main" onClick={onToggleOpen} aria-expanded={expanded}>
          <SpiderIcon size={20} className="admin-crawler-row__icon" />
          <span className="admin-crawler-row__title-wrap">
            <span className="admin-crawler-row__title-line">
              <strong>{crawler.name}</strong>
              {activity && (
                <span className={`admin-status admin-generation-state is-${activity.tone}`}>
                  {activity.text}
                </span>
              )}
            </span>
            <span className="admin-crawler-row__meta">
              上次抓取 {formatLastCrawl(crawler.lastCrawlAt)} · 每次新增 {crawler.targetNew || "10"} 條 · 累計爬取 {crawler.totalCrawledCount ?? 0} 條
            </span>
          </span>
        </button>
        <div className="admin-crawler-row__actions">
          <button className="admin-btn" type="button" onClick={onTogglePaused} disabled={!!pendingAction}>
            {pendingAction === "pause" ? "處理中..." : crawler.paused ? "恢復使用" : "暫停使用"}
          </button>
          <button className="admin-btn" type="button" onClick={onRun}>
            {pendingAction === "run" ? "觸發中..." : "立即抓取"}
          </button>
          <button className="admin-btn" type="button" onClick={onUpload}>
            {pendingAction === "upload" ? "觸發中..." : "觸發上傳"}
          </button>
          <button className="admin-btn" type="button" onClick={onEdit} disabled={!!pendingAction}>
            編輯
          </button>
          <button className="admin-btn is-danger" type="button" onClick={onDelete} disabled={!!pendingAction}>
            刪除
          </button>
        </div>
      </div>
      {expanded && (
        <CrawlerDetail
          crawler={crawler}
          stopping={pendingAction === "stop"}
          actionPending={!!pendingAction}
          onStop={onStop}
        />
      )}
    </div>
  );
}

function CrawlerDetail({
  crawler,
  stopping,
  actionPending,
  onStop,
}: {
  crawler: api.AdminCrawler;
  stopping: boolean;
  actionPending: boolean;
  onStop: () => void;
}) {
  const scan = crawler.scanGenerationStatus;
  const recentCrawl = crawler.currentTask ?? crawler.lastCrawlResult;
  const upload = crawlerUploadStatus(crawler);
  const uploadResult = crawlerUploadResult(crawler);
  const busy = crawlerBusy(crawler);
  return (
    <div className="admin-crawler-detail">
      {busy && (
        <div className="admin-crawler-detail__actions">
          <button className="admin-btn" type="button" onClick={onStop} disabled={actionPending}>
            {stopping ? "暫停中..." : "暫停"}
          </button>
        </div>
      )}
      <div className="admin-crawler-detail__grid">
        <GenStageCard
          label="抓取"
          status={scan}
          display={crawlerCrawlStatus(crawler)}
          counts={[
            { label: "累計爬取", value: crawler.totalCrawledCount ?? 0 },
            { label: "最近檢查", value: recentCrawl?.checked ?? 0 },
            { label: "最近新增", value: recentCrawl?.newVideos ?? 0 },
          ]}
        />
        <GenStageCard
          label="上傳"
          status={crawler.uploadGenerationStatus}
          display={upload}
          counts={[
            { label: "累計上傳", value: crawler.migratedVideoCount ?? 0 },
            { label: "最近上傳", value: uploadResult?.uploadedCount ?? 0 },
            { label: "本機保留", value: crawler.localVideoCount ?? 0 },
          ]}
        />
        <GenStageCard
          label="封面"
          status={crawler.thumbnailGenerationStatus}
          counts={[
            { label: "已生成", value: crawler.thumbnailReadyCount },
            { label: "待生成", value: crawler.thumbnailPendingCount },
            { label: "失敗", value: crawler.thumbnailFailedCount, tone: "danger" },
          ]}
        />
        <GenStageCard
          label="預覽影片"
          status={crawler.previewGenerationStatus}
          counts={[
            { label: "已生成", value: crawler.teaserReadyCount },
            { label: "待生成", value: crawler.teaserPendingCount },
            { label: "失敗", value: crawler.teaserFailedCount, tone: "danger" },
          ]}
        />
        <GenStageCard
          label="影片指紋"
          status={crawler.fingerprintGenerationStatus}
          counts={[
            { label: "已生成", value: crawler.fingerprintReadyCount },
            { label: "待生成", value: crawler.fingerprintPendingCount },
            { label: "失敗", value: crawler.fingerprintFailedCount, tone: "danger" },
          ]}
        />
      </div>
    </div>
  );
}

function GenStageCard({
  label,
  status,
  display,
  counts,
}: {
  label: string;
  status?: api.DriveGenerationStatus;
  display?: CrawlerDisplayStatus;
  counts: Array<{ label: string; value: number; tone?: "danger" }>;
}) {
  const mapped = display ?? crawlerGenerationStatus(status);
  return (
    <div className="admin-gen-col">
      <div className="admin-gen-col__head">
        <span className="admin-gen-col__label">{label}</span>
        <span className={`admin-status admin-generation-state is-${mapped.tone}`}>
          {mapped.text}
        </span>
      </div>
      {status?.currentTitle && <div className="admin-gen-col__detail">{status.currentTitle}</div>}
      <div className="admin-gen-col__counts">
        {counts.map((count) => (
          <div className="admin-gen-col__count" key={count.label}>
            <span>{count.label}</span>
            <strong className={count.tone === "danger" && count.value > 0 ? "is-danger" : undefined}>{count.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- 编辑器 ----------

function CrawlerEditorModal({
  open,
  crawler,
  uploadTargets,
  onClose,
  onSaved,
}: {
  open: boolean;
  crawler: api.AdminCrawler | null;
  uploadTargets: api.AdminDrive[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = crawler !== null;
  const [form, setForm] = useState<CrawlerEditorForm>(() => editorFormFromCrawler(crawler));
  const [scriptURL, setScriptURL] = useState("");
  const [importMode, setImportMode] = useState<"file" | "url">("file");
  const [importing, setImporting] = useState(false);
  const [replacingScript, setReplacingScript] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<api.CrawlerDryRunResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { show } = useToast();
  const busy = importing || testing || saving;
  const selectedFeed = form.feeds.find(feed => feed.id === form.selectedFeedId);
  const feedError = !form.scriptPath || selectedFeed ? ""
    : form.selectedFeedId ? "腳本已不支援原選欄目，請重新選擇。" : "請選擇抓取欄目。";

  useEffect(() => {
    if (!open) return;
    setForm(editorFormFromCrawler(crawler));
    setScriptURL("");
    setImportMode("file");
    setTestResult(null);
    setDragOver(false);
    setReplacingScript(false);
  }, [open, crawler]);

  // 导入成功后展示脚本信息，替换时再展开导入区。
  const showImportArea = !form.scriptPath || replacingScript;

  function set<K extends keyof CrawlerEditorForm>(key: K, value: CrawlerEditorForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function cancelReplace() {
    setScriptURL("");
    setReplacingScript(false);
  }

  async function importFile(file: File | null | undefined) {
    if (!file || busy) return;
    if (!file.name.toLowerCase().endsWith(".py")) {
      show("僅支援 .py 腳本檔案", "error");
      return;
    }
    setImporting(true);
    try {
      const resp = await api.importCrawlerScriptFile(file);
      setForm((prev) => editorFormWithImportedScript(prev, resp));
      setTestResult(null);
      setReplacingScript(false);
      show("腳本已導入", "success");
    } catch (e) {
      show(e instanceof Error ? e.message : "導入失敗", "error");
    } finally {
      setImporting(false);
    }
  }

  async function importURL() {
    if (busy) return;
    const url = scriptURL.trim();
    if (!url) {
      show("請填寫鏈接", "error");
      return;
    }
    setImporting(true);
    try {
      const resp = await api.importCrawlerScriptURL(url);
      setForm((prev) => editorFormWithImportedScript(prev, { ...resp, sourceUrl: resp.sourceUrl || url }));
      setScriptURL("");
      setTestResult(null);
      setReplacingScript(false);
      show("腳本已導入", "success");
    } catch (e) {
      show(e instanceof Error ? e.message : "導入失敗", "error");
    } finally {
      setImporting(false);
    }
  }

  async function updateFromSource() {
    if (busy) return;
    const url = form.scriptSourceUrl.trim();
    if (!url) return;
    setImporting(true);
    try {
      const resp = await api.importCrawlerScriptURL(url);
      setForm((prev) => editorFormWithImportedScript(prev, { ...resp, sourceUrl: resp.sourceUrl || url }));
      setTestResult(null);
      show("已從原鏈接拉取最新腳本", "success");
    } catch (e) {
      show(e instanceof Error ? e.message : "從原鏈接更新失敗", "error");
    } finally {
      setImporting(false);
    }
  }

  async function test() {
    if (busy) return;
    const scriptPath = form.scriptPath.trim();
    if (!scriptPath) {
      show("請先導入爬蟲腳本", "error");
      return;
    }
    if (feedError) {
      show(feedError, "error");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.testCrawlerScript({ scriptPath, proxy: form.proxy.trim(), selectedFeedId: form.selectedFeedId });
      setTestResult(result);
      if (result.ok) {
        show(crawlerTestSummary(result), "success");
      } else {
        show(crawlerTestFailure(result) || "測試失敗", "error");
      }
    } catch (e) {
      show(e instanceof Error ? e.message : "測試失敗", "error");
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    if (busy) return;
    if (!form.scriptPath.trim()) {
      show("請先導入爬蟲腳本", "error");
      return;
    }
    if (feedError) {
      show(feedError, "error");
      return;
    }
    const target = form.targetNew.trim();
    if (target && (!/^\d+$/.test(target) || Number(target) < 1)) {
      show("每次新增影片數需為正整數", "error");
      return;
    }
    setSaving(true);
    try {
      const resp = await api.upsertCrawler({
        id: crawler?.id,
        selectedFeedId: form.selectedFeedId,
        scriptPath: form.scriptPath.trim(),
        scriptSourceUrl: form.scriptSourceUrl.trim(),
        targetNew: target,
        proxy: form.proxy.trim(),
        uploadProxy: form.uploadProxy.trim(),
        uploadDriveId: form.uploadDriveId,
      });
      if (resp.warning) {
        show(`已儲存，但初始化失敗：${resp.warning}`, "error");
      } else if (resp.deferred) {
        show(resp.message || "已儲存，將在目前爬蟲任務結束後生效", "success");
      } else {
        show("已儲存並生效", "success");
      }
      onSaved();
    } catch (e) {
      show(e instanceof Error ? e.message : "儲存失敗", "error");
    } finally {
      setSaving(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    importFile(e.dataTransfer.files?.[0]);
  }

  return (
    <Modal
      open={open}
      title={isEdit ? "編輯爬蟲" : "新增爬蟲"}
      onClose={() => { if (!busy) onClose(); }}
      className="admin-modal--crawler"
      footer={
        <>
          <button type="button" className="admin-btn" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button type="button" className="admin-btn is-primary" onClick={save} disabled={busy || !form.scriptPath || !!feedError}>
            {saving ? "儲存中..." : "確認"}
          </button>
        </>
      }
    >
      <div className="admin-crawler-editor">
        <div className="admin-crawler-editor__grid">
          <section className="admin-crawler-panel admin-crawler-panel--script" aria-labelledby="crawler-script-heading">
            <header className="admin-crawler-panel__head">
              <span className="admin-crawler-section-number" aria-hidden="true">01</span>
              <h3 id="crawler-script-heading">爬蟲腳本</h3>
            </header>

            <input
              ref={fileInputRef}
              type="file"
              accept=".py,text/x-python"
              disabled={busy}
              hidden
              onChange={(e) => {
                importFile(e.target.files?.[0]);
                e.currentTarget.value = "";
              }}
            />

            {form.scriptPath && (
              <div className="admin-crawler-current-script">
                <div className="admin-crawler-script-identity">
                  <ScriptFileIcon size={40} className="admin-crawler-script-icon" />
                  <div>
                    <strong>{form.name || "已導入腳本"}</strong>
                  </div>
                  <CheckCircle2 size={17} className="admin-crawler-script-check" aria-label="腳本已導入" />
                </div>
                <div className="admin-crawler-script-meta">
                  <span>{form.scriptSourceUrl ? "鏈接導入" : "本機導入"}</span>
                  <span>{form.feeds.length} 個可選欄目</span>
                </div>
                {form.scriptSourceUrl && <p className="admin-crawler-script-source" title={form.scriptSourceUrl}>{form.scriptSourceUrl}</p>}
                <div className="admin-crawler-current-script__actions">
                  {replacingScript ? (
                    <button type="button" className="admin-btn" onClick={cancelReplace} disabled={busy}>取消替換</button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="admin-btn"
                        disabled={busy}
                        onClick={() => {
                          setScriptURL(form.scriptSourceUrl);
                          setImportMode(form.scriptSourceUrl ? "url" : "file");
                          setReplacingScript(true);
                        }}
                      >
                        替換腳本檔案
                      </button>
                      {form.scriptSourceUrl && (
                        <button
                          type="button"
                          className="admin-btn"
                          onClick={updateFromSource}
                          disabled={busy}
                          title={`從 ${form.scriptSourceUrl} 重新拉取腳本`}
                        >
                          {importing ? "更新中..." : "從原鏈接更新"}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {showImportArea && (
              <div className="admin-crawler-import-box">
                <div className="admin-crawler-import-methods" role="group" aria-label="腳本導入方式">
                  <button type="button" aria-pressed={importMode === "file"} disabled={busy} onClick={() => setImportMode("file")}>
                    <Upload size={14} aria-hidden="true" />本機檔案
                  </button>
                  <button type="button" aria-pressed={importMode === "url"} disabled={busy} onClick={() => setImportMode("url")}>
                    <Link2 size={14} aria-hidden="true" />腳本鏈接
                  </button>
                </div>
                {importMode === "file" ? (
                  <div
                    className={`admin-crawler-dropzone${dragOver ? " is-dragover" : ""}${busy ? " is-busy" : ""}`}
                    role="button"
                    aria-label="上傳爬蟲腳本"
                    aria-disabled={busy}
                    tabIndex={busy ? -1 : 0}
                    onClick={() => !busy && fileInputRef.current?.click()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (!busy) fileInputRef.current?.click();
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (!busy) setDragOver(true);
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
                    }}
                    onDrop={onDrop}
                  >
                    <span className="admin-crawler-dropzone__icon">
                      {importing ? <LoaderCircle size={24} className="admin-spin" aria-hidden="true" /> : <Upload size={24} strokeWidth={1.5} aria-hidden="true" />}
                    </span>
                    <strong>{importing ? "正在導入腳本" : "點選上傳或拖入檔案"}</strong>
                  </div>
                ) : (
                  <div className="admin-crawler-link-import">
                    <label htmlFor="crawler-script-url">腳本鏈接</label>
                    <input
                      id="crawler-script-url"
                      type="url"
                      className="admin-input"
                      value={scriptURL}
                      placeholder="https://example.com/crawler.py"
                      onChange={(e) => setScriptURL(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          importURL();
                        }
                      }}
                      disabled={busy}
                    />
                    <button className="admin-btn" type="button" onClick={importURL} disabled={busy || !scriptURL.trim()}>
                      {importing && <LoaderCircle size={14} className="admin-spin" aria-hidden="true" />}
                      {importing ? "導入中..." : "導入腳本"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="admin-crawler-panel admin-crawler-panel--settings" aria-labelledby="crawler-settings-heading">
            <header className="admin-crawler-panel__head">
              <span className="admin-crawler-section-number" aria-hidden="true">02</span>
              <h3 id="crawler-settings-heading">抓取設定</h3>
            </header>
            <div className="admin-crawler-params">
              <div className="admin-crawler-params__main">
                <div className="admin-form__row">
                  <label htmlFor="crawler-feed">抓取欄目</label>
                  <div className="admin-form-select-wrap">
                    <select
                      id="crawler-feed"
                      className="admin-form-select"
                      value={form.selectedFeedId}
                      disabled={busy || !form.scriptPath || form.feeds.length === 0}
                      aria-invalid={!!feedError}
                      aria-describedby={feedError ? "crawler-feed-error" : undefined}
                      onChange={(e) => {
                        set("selectedFeedId", e.target.value);
                        setTestResult(null);
                      }}
                    >
                      {!selectedFeed && <option value={form.selectedFeedId} disabled>
                        {!form.scriptPath ? "導入腳本後選擇" : form.selectedFeedId ? `原欄目 ${form.selectedFeedId} 已不可用` : "請選擇欄目"}
                      </option>}
                      {form.feeds.map(feed => <option key={feed.id} value={feed.id}>{feed.label}</option>)}
                    </select>
                    <ChevronDown size={15} className="admin-form-select__icon" aria-hidden="true" />
                  </div>
                </div>
                <div className="admin-form__row">
                  <label htmlFor="crawler-target">每次新增影片數</label>
                  <div className="admin-crawler-number-input">
                    <input
                      id="crawler-target"
                      type="number"
                      min={1}
                      value={form.targetNew}
                      disabled={busy}
                      onChange={(e) => set("targetNew", e.target.value)}
                      placeholder="10"
                    />
                    <span aria-hidden="true">條</span>
                  </div>
                </div>
              </div>
              {feedError && <p id="crawler-feed-error" className="admin-crawler-field-error" role="alert">{feedError}</p>}
              <div className="admin-crawler-destination">
                <CrawlerUploadTargetField
                  value={form.uploadDriveId}
                  onChange={(value) => set("uploadDriveId", value)}
                  uploadTargets={uploadTargets}
                  disabled={busy}
                />
              </div>
              <div className="admin-crawler-network">
                <div className="admin-form__row">
                  <label htmlFor="crawler-proxy">抓取代理</label>
                  <input
                    id="crawler-proxy"
                    placeholder="支援 HTTP/HTTPS 和 SOCKS5/SOCKS5H"
                    disabled={busy}
                    value={form.proxy}
                    onChange={(e) => {
                      set("proxy", e.target.value);
                      setTestResult(null);
                    }}
                  />
                </div>
                <div className="admin-form__row">
                  <label htmlFor="crawler-upload-proxy">上傳代理</label>
                  <input
                    id="crawler-upload-proxy"
                    placeholder="支援 HTTP/HTTPS 和 SOCKS5/SOCKS5H"
                    disabled={busy}
                    value={form.uploadProxy}
                    onChange={(e) => set("uploadProxy", e.target.value)}
                  />
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className={`admin-crawler-test-panel${testing ? " is-testing" : ""}`} aria-labelledby="crawler-test-heading" aria-busy={testing}>
          <header className="admin-crawler-panel__head admin-crawler-test-panel__bar">
            <span className="admin-crawler-section-number" aria-hidden="true">03</span>
            <h3 id="crawler-test-heading">測試腳本</h3>
            <button className="admin-btn" type="button" onClick={test} disabled={!form.scriptPath || busy || !!feedError}>
              {testing ? "測試中..." : testResult ? "重新測試" : "執行測試"}
            </button>
          </header>
          {testResult && <CrawlerTestResult result={testResult} />}
        </section>
      </div>
    </Modal>
  );
}

function CrawlerTestResult({ result }: { result: api.CrawlerDryRunResult }) {
  const item = result.items[0];
  const failure = crawlerTestFailure(result);
  const media = result.mediaCheck;

  return (
    <div className={`admin-crawler-test-result ${result.ok ? "is-ok" : "is-error"}`} aria-live="polite">
      <div className="admin-crawler-test-result__head">
        <span className={`admin-status is-${result.ok ? "ok" : "error"}`}>{crawlerTestSummary(result)}</span>
        <span>{result.feedLabel || result.feedId}</span>
        <span>已解析 {result.items.length} 條樣本</span>
        {result.durationMs > 0 && <span>{Math.round(result.durationMs / 1000)} 秒</span>}
      </div>
      {failure && <div className="admin-crawler-test-result__error">{failure}</div>}
      {item && (
        <div className="admin-crawler-sample">
          <span><Play size={17} aria-hidden="true" /></span>
          <div><small>抓取樣本</small><strong>{item.title}</strong></div>
        </div>
      )}
      <details className="admin-crawler-test-result__details">
        <summary>查看檢測詳情</summary>
        <div className="admin-crawler-test-result__grid">
          <CrawlerTestField label="抓取欄目" value={result.feedLabel || result.feedId} />
          <CrawlerTestField label="協議交互" value={result.validated.includes("protocol") ? "已通過" : "未通過"} />
          <CrawlerTestField label="媒體探測" value={result.validated.includes("media_probe") ? "已通過" : media ? "未通過" : "未驗證"} />
          {item && <>
            <CrawlerTestField label="唯一標識" value={item.sourceId} />
            <CrawlerTestField label="影片連結" value={item.mediaUrl} />
            <CrawlerTestField label="封面圖" value={item.thumbnailUrl} />
            <CrawlerTestField label="詳情頁" value={item.detailUrl} />
          </>}
          {media && <CrawlerTestField label="樣本媒體" value={[
            media.ok ? "檢查通過" : "檢查失敗",
            media.status ? `HTTP ${media.status}` : "",
            media.contentType,
            media.contentLengthBytes ? formatBytes(media.contentLengthBytes) : "",
          ].filter(Boolean).join(" · ")} />}
        </div>
      </details>
      {result.log && result.log.length > 0 && (
        <details className="admin-crawler-test-result__log">
          <summary>腳本日志</summary>
          <pre>{result.log.join("\n")}</pre>
        </details>
      )}
    </div>
  );
}

function CrawlerTestField({ label, value }: { label: string; value?: string | number }) {
  if (value === undefined || value === "") return null;
  return (
    <div className="admin-crawler-test-result__field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function crawlerTestFailure(result: api.CrawlerDryRunResult) {
  return result.error || result.mediaCheck?.error || "";
}

function formatLastCrawl(ts?: number) {
  if (!ts) return "從未";
  return new Date(ts * 1000).toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}
