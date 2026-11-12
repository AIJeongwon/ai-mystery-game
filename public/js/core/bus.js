// 단순 이벤트 버스
const map = new Map();
export function on(evt, fn) {
  if (!map.has(evt)) map.set(evt, new Set());
  map.get(evt).add(fn);
  return () => map.get(evt)?.delete(fn);
}
export function once(evt, fn) {
  const off = on(evt, (...a) => {
    off();
    fn(...a);
  });
  return off;
}
export function emit(evt, ...args) {
  const set = map.get(evt);
  if (!set) return;
  for (const fn of [...set]) {
    try {
      fn(...args);
    } catch (e) {
      console.error(`[bus:${evt}]`, e);
    }
  }
}
// 특정 이벤트를 기다린다 (조건식 선택)
export function waitFor(evt, pred) {
  return new Promise((resolve) => {
    const off = on(evt, (...a) => {
      if (!pred || pred(...a)) {
        off();
        resolve(a[0]);
      }
    });
  });
}
