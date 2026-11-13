// 와이어(피드) — 세계의 소식을 시간순으로 쌓는다
import { G } from "../../core/store.js";
import { emit } from "../../core/bus.js";
import { uid } from "../../core/util.js";
import { now } from "./query.js";

export function feed(kind, text, extra = {}) {
  const item = { id: uid("fd"), t: now(), kind, text, ...extra };
  G.world.feed.push(item);
  if (G.world.feed.length > 200) G.world.feed.splice(0, G.world.feed.length - 200);
  emit("feed", item);
  return item;
}
