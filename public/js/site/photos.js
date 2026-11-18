// 기자가 찍은 사진 — 증거를 얻는 순간의 화면을 작게 줄여 둔다. 증거판의 카드에 그 사진이 붙는다.
// 저장은 현장 상태와 따로 한다(크기가 크다). 저장소가 차면 사진 없이 간다.
const KEY = "gijeongsasil.site.photo.";
const W = 320, H = 240;

export function loadPhotos(site) {
  try {
    return JSON.parse(localStorage.getItem(KEY + site) || "{}") || {};
  } catch {
    return {};
  }
}
export function savePhotos(site, photos) {
  try {
    localStorage.setItem(KEY + site, JSON.stringify(photos));
  } catch { /* 자리가 없으면 넘어간다 */ }
}
export function clearPhotos(site) {
  try {
    localStorage.removeItem(KEY + site);
  } catch { /* 무시 */ }
}

// 캔버스를 4:3으로 잘라 줄인다. zoom > 1이면 더 당겨 찍는다. (fx, fy)는 찍을 곳(0~1, 기본은 화면 가운데).
let scratch = null;
export function shrink(canvas, zoom = 1, fx = 0.5, fy = 0.5) {
  try {
    scratch ||= document.createElement("canvas");
    scratch.width = W;
    scratch.height = H;
    const g = scratch.getContext("2d");
    const cw = canvas.width, ch = canvas.height;
    let sw = Math.min(cw, (ch * W) / H) / zoom, sh = (sw * H) / W;
    if (sh > ch) {
      sh = ch;
      sw = (sh * W) / H;
    }
    const sx = Math.max(0, Math.min(cw - sw, fx * cw - sw / 2)), sy = Math.max(0, Math.min(ch - sh, fy * ch - sh / 2));
    g.drawImage(canvas, sx, sy, sw, sh, 0, 0, W, H);
    const url = scratch.toDataURL("image/jpeg", 0.72);
    return url.length > 2000 ? url : null; // 빈 화면이면 버린다
  } catch {
    return null;
  }
}
