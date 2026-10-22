type Progress = { seconds: number; updatedAt: number };
const KEY = "91-playback-progress-v1";
const MAX_ENTRIES = 500;

function read(): Record<string, Progress> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Progress> : {};
  } catch { return {}; }
}

export function recentPlaybackIDs(): string[] {
  return Object.entries(read()).filter(([,value]) => value && Number.isFinite(value.updatedAt))
    .sort((a,b) => b[1].updatedAt-a[1].updatedAt).map(([id]) => id);
}

export function bindPlaybackProgress(video: HTMLVideoElement, id: string) {
  let restored = false;
  let lastSaved = 0;
  const restore = () => {
    if (restored || !Number.isFinite(video.duration) || video.duration <= 0) return;
    restored = true;
    const seconds = read()[id]?.seconds;
    if (Number.isFinite(seconds) && seconds >= 10 && seconds < video.duration - 15) video.currentTime = seconds;
  };
  const save = () => {
    if (!restored || !Number.isFinite(video.currentTime) || !Number.isFinite(video.duration)) return;
    try {
      const entries = read();
      if (video.ended || video.currentTime >= video.duration - 15) delete entries[id];
      else if (video.currentTime >= 10) entries[id] = {seconds: video.currentTime, updatedAt: Date.now()};
      const trimmed = Object.fromEntries(Object.entries(entries)
        .filter(([, value]) => value && Number.isFinite(value.updatedAt))
        .sort((a, b) => b[1].updatedAt - a[1].updatedAt).slice(0, MAX_ENTRIES));
      localStorage.setItem(KEY, JSON.stringify(trimmed));
    } catch { /* Playback also works when browser storage is unavailable. */ }
  };
  const tick = () => { if (Date.now() - lastSaved >= 5000) { lastSaved = Date.now(); save(); } };
  video.addEventListener("loadedmetadata", restore);
  video.addEventListener("durationchange", restore);
  video.addEventListener("timeupdate", tick);
  video.addEventListener("pause", save);
  video.addEventListener("ended", save);
  window.addEventListener("pagehide", save);
  restore();
  return () => {
    save();
    video.removeEventListener("loadedmetadata", restore);
    video.removeEventListener("durationchange", restore);
    video.removeEventListener("timeupdate", tick);
    video.removeEventListener("pause", save);
    video.removeEventListener("ended", save);
    window.removeEventListener("pagehide", save);
  };
}
