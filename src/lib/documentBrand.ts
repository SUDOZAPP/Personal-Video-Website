export const APP_NAME = "Personal Video Website";

export function watchDocumentBrand() {
  const update = () => {
    const title = document.title.trim();
    const branded = !title || title === "91" ? APP_NAME : title.includes(APP_NAME) ? title : `${title} · ${APP_NAME}`;
    if (document.title !== branded) document.title = branded;
  };
  update();
  const observer = new MutationObserver(update);
  const title = document.querySelector("title");
  if (title) observer.observe(title, {childList: true, characterData: true, subtree: true});
  return () => observer.disconnect();
}
