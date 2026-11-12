// 편집 데스크 초안 보조 — 확보한 사실로 초안을 받는다 (LLM이 없으면 사실을 이어 붙인다)
import { ask } from "../../llm/api.js";
import { draftRequest } from "../../llm/prompts.js";
import { notes } from "./notebook.js";

export async function requestDraft(ev) {
  const nb = notes(ev.id);
  const facts = ev.facts.filter((f) => nb[f.id] && nb[f.id].st !== "debunked").map((f) => ({ text: f.text, st: nb[f.id].st }));
  if (!facts.length) return null;
  const r = await ask(draftRequest({ ev, facts }));
  if (r.ok && r.data?.body) return r.data;
  return { headline: ev.title, body: facts.map((f) => (f.st === "confirmed" ? f.text : f.text.replace(/다\.$/, "다는 증언이 나왔다."))).join(" ") };
}
