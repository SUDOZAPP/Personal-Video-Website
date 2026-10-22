import { CircleCheck, CircleSlash, CircleX, SkipForward, TriangleAlert } from "lucide-react";
import type { ScanOutcome, ScanResult } from "../api";
import { ScanResultIcon } from "../icons/ScanResultIcon";
import { scanOutcomeLabels, scanResultMetrics } from "./scanResults";

const outcomeIcons = {
  succeeded: CircleCheck,
  partial: TriangleAlert,
  failed: CircleX,
  canceled: CircleSlash,
  skipped: SkipForward,
} satisfies Record<ScanOutcome, typeof CircleCheck>;
const timeFormatter = new Intl.DateTimeFormat("zh-TW", {
  month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
});

export function ScanResultDetails({
  result: completedResult,
  scanning = false,
  loading = false,
}: {
  result?: ScanResult;
  scanning?: boolean;
  loading?: boolean;
}) {
  const result = scanning ? undefined : completedResult;
  const metrics = result && {
    ...result,
    skippedCount: result.duplicateCount + result.tombstonedCount,
  };
  const finishedAt = result ? new Date(result.finishedAt) : null;
  const validFinishedAt = finishedAt && Number.isFinite(finishedAt.getTime()) ? finishedAt : null;
  const StatusIcon = result ? outcomeIcons[result.state] : null;
  return (
    <section className="admin-detail-card admin-scan-result" aria-label="掃描來源結果" aria-busy={loading || undefined}>
      <header className="admin-scan-result__header">
        <div className="admin-detail-card__title-left">
          <ScanResultIcon />
          <h2>掃描來源結果</h2>
        </div>
        {result && StatusIcon && !loading && (
          <div className="admin-scan-result__meta">
            <span className={`admin-scan-result__status is-${result.state}`} role="status">
              <StatusIcon size={12} aria-hidden="true" />
              {scanOutcomeLabels[result.state]}
            </span>
            {validFinishedAt && (
              <time
                dateTime={result.finishedAt}
                title={`結束時間：${validFinishedAt.toLocaleString("zh-TW", { hour12: false })}`}
                aria-label={`結束時間：${validFinishedAt.toLocaleString("zh-TW", { hour12: false })}`}
              >
                {timeFormatter.format(validFinishedAt)}
              </time>
            )}
          </div>
        )}
      </header>
      {result || loading ? (
        <dl className="admin-scan-result__metrics">
          {scanResultMetrics.map(({ key, label }) => {
            const value = loading ? undefined : metrics?.[key];
            const valueClass = key === "errorCount" && value != null && value > 0 ? "is-error" : value === 0 ? "is-zero" : undefined;
            return (
              <div className="admin-scan-result__metric" key={key}>
                <dt>{label}</dt>
                <dd className={valueClass}>{value ?? "\u00a0"}</dd>
              </div>
            );
          })}
        </dl>
      ) : (
        <p className="admin-scan-result__empty" role="status">
          {scanning ? "掃描來源進行中，請等待掃描來源結束" : "暫無掃描來源結果"}
        </p>
      )}
    </section>
  );
}
