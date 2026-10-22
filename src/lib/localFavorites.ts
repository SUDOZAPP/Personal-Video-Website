const KEY = "91-local-favorites-v1";
export function favoriteIDs(): string[] {
 try { const value: unknown = JSON.parse(localStorage.getItem(KEY) || "[]");
   return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string").slice(0,500) : [];
 } catch { return []; }
}
export function toggleFavorite(id: string): boolean {
 const ids=favoriteIDs(); const selected=!ids.includes(id);
 localStorage.setItem(KEY,JSON.stringify(selected ? [id,...ids].slice(0,500) : ids.filter(value=>value!==id)));
 window.dispatchEvent(new Event("91-favorites-changed"));
 return selected;
}
