// 시·도 경계 자료(tools/build-admin1.mjs가 만든 것)를 읽는 도우미. 화면을 모른다.

// 고리 하나는 [x0, y0, dx, dy, ...] 꼴의 정수 배열이다: 첫 점 뒤로는 앞 점과의 차이만 적혀 있다. → [[경도, 위도], ...]
export function decodeRings(rings, scale) {
  return rings.map((flat) => {
    const out = [];
    let x = 0, y = 0;
    for (let i = 0; i < flat.length; i += 2) {
      x += flat[i];
      y += flat[i + 1];
      out.push([x / scale, y / scale]);
    }
    return out;
  });
}

// 점이 고리들 안에 있는가 (짝홀 규칙: 구멍과 섬이 한 목록에 섞여 있어도 맞는다)
export function pointInRings(rings, lon, lat) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

// 고리들을 감싸는 상자 [서, 남, 동, 북]
export function boundsOf(rings) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    }
  }
  return [w, s, e, n];
}
