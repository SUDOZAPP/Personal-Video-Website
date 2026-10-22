import type { AdminDriveStorage } from "../api";
import { formatBytes } from "../storageFormat";

export function StorageSummary({
  storage,
  loading = false,
}: {
  storage: AdminDriveStorage | null;
  loading?: boolean;
}) {
  const metrics = [
    { label: "封面占用", value: storage ? formatBytes(storage.thumbnailBytes) : "" },
    { label: "預覽影片占用", value: storage ? formatBytes(storage.teaserBytes) : "" },
    { label: "本機媒體合計", value: storage ? formatBytes(storage.totalBytes) : "" },
    { label: "磁碟可用", value: storage ? formatBytes(storage.availableBytes) : "" },
  ];

  return (
    <section
      className="admin-card admin-storage-summary"
      aria-label="本機媒體儲存"
      aria-busy={loading || undefined}
    >
      {metrics.map((metric) => (
        <div key={metric.label} className="admin-storage-summary__metric">
          <span>{metric.label}</span>
          <strong aria-hidden={loading || undefined}>
            {loading ? "\u00a0" : metric.value || "\u00a0"}
          </strong>
        </div>
      ))}
    </section>
  );
}
