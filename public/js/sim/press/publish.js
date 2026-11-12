// 발행 — 판정을 받아 품질·독점성·조회수·신뢰도를 정하고 기사로 남긴다
import { G } from "../../core/store.js";
import { emit } from "../../core/bus.js";
import { clamp, rand, uid, sum } from "../../core/util.js";
import { ask } from "../../llm/api.js";
import { judgeRequest } from "../../llm/prompts.js";
import { HOME } from "../../data/world.js";
import { C, feed, now, registerCoverage, rivalMaxDepth, rivalCount } from "../world.js";
import { addInk, enact } from "../canon.js";
import { spend } from "./base.js";
import { notes } from "./notebook.js";
import { estimateViews } from "./reach.js";
import { fallbackJudge } from "./judge.js";
import { gainXp } from "./growth.js";

const DEPTH_PTS = [1, 1.6, 2.6, 3.6];
export async function publish({ ev, headline, body, appraisal, special }) {
  const g = G;
  const known = ev ? notes(ev.id) : {};
  let j, via = "llm";
  const r = await ask(judgeRequest({ ev, headline, body, decree: appraisal?.sentence, known, extra: special?.extraFacts }));
  if (r.ok && r.data && Number.isInteger(r.data.accuracy)) j = r.data;
  else {
    j = fallbackJudge({ ev, headline, body });
    via = "rule";
  }
  if (G !== g) return null;

  // 기사 쓰는 동안 세상은 돌아간다
  spend(50 + Math.min(130, Math.round(body.length / 7)));

  const o = G.outlet;
  const usedFacts = ev ? [...new Set(j.used || [])].map((id) => ev.facts.find((f) => f.id === id)).filter(Boolean) : [];
  const trueUsed = usedFacts.filter((f) => f.true);
  const maxDepth = trueUsed.length ? Math.max(...trueUsed.map((f) => f.depth)) : -1;
  const depthScore = ev ? clamp(1.5 + sum(trueUsed, (f) => DEPTH_PTS[f.depth]), 0, 10) : 4;
  const falseClaims = (j.false_claims || []).slice(0, 4);
  let Q = ev ? 0.3 * j.accuracy + 0.25 * depthScore + 0.22 * j.writing + 0.23 * j.headline : 0.4 * j.accuracy + 0.35 * j.writing + 0.25 * j.headline;
  if (!j.on_topic) Q *= 0.5;
  Q = clamp(Q, 0.5, 10);

  // 독점성
  let X = 1, scoop = false, first = false, rehash = false;
  if (ev) {
    const prior = o.articles.filter((a) => a.ev === ev.id && !a.auto);
    const before = new Set(prior.flatMap((a) => a.used));
    const fresh = trueUsed.filter((f) => !before.has(f.id));
    const rmax = rivalMaxDepth(ev);
    const rn = rivalCount(ev);
    if (maxDepth >= 1 && maxDepth > rmax && fresh.some((f) => f.depth === maxDepth)) {
      scoop = true;
      X = 2.1 + 0.6 * (maxDepth - 1);
    } else if (rn === 0 && !prior.length) {
      first = true;
      X = 1.6;
    } else X = Math.max(0.45, 1 / (1 + 0.22 * rn));
    if (prior.length && !fresh.length) {
      rehash = true;
      X *= 0.35;
    }
    if (ev.stage >= 4) X *= 0.4;
  }
  const heat = ev ? ev.heat : 12;
  const est = estimateViews({ evCountry: ev?.country ?? HOME, sig: ev?.sig ?? 1, heat, Q, X, sens: j.sensational, cat: ev?.cat ?? "cul" });
  const plan = Math.round(est.total * rand(0.88, 1.15) * (special?.viewsMul ?? 1));
  let cpmF = 0;
  for (const [id, v] of Object.entries(est.dist)) cpmF += (v / est.total) * (0.35 + C(id).gdp * 0.19);

  // 신뢰도
  const confirmedDeep = trueUsed.filter((f) => f.depth >= 1 && known[f.id]?.st === "confirmed").length;
  let dCred = (j.accuracy - 6.5) * 0.45 + confirmedDeep * 0.3 + (scoop ? 1.2 : 0) - falseClaims.length * 1.6 - (j.unsupported || 0) * 0.45 - Math.max(0, j.sensational - 6) * 0.5;
  if (!j.on_topic) dCred -= 1;
  if (dCred > 0) dCred *= Math.pow(Math.max(0, 1 - o.cred / 100), 1.3) * 1.7; // 신뢰는 높을수록 쌓기 어렵다
  dCred = clamp(dCred, -8, 4);
  o.cred = clamp(o.cred + dCred, 1, 99);

  const art = {
    id: uid("ar"), at: now(), ev: ev?.id ?? null, cat: ev?.cat ?? "cul", country: ev?.country ?? HOME, headline, body,
    decree: null, scores: { acc: j.accuracy, wri: j.writing, head: j.headline, sens: j.sensational, depth: depthScore, Q },
    used: trueUsed.map((f) => f.id), usedAll: usedFacts.map((f) => f.id), maxDepth, scoop, first, rehash, X,
    plan, done: 0, rev: 0, newSubs: 0, tick: 0, cpmF, dist: est.dist, total: est.total, comment: j.comment || "", falseClaims,
    unsupported: j.unsupported || 0, dCred, via, settled: false, evTitle: ev?.title ?? "칼럼",
  };
  o.articles.push(art);
  o.totals.articles++;
  if (scoop) o.totals.scoops++;

  if (ev) {
    registerCoverage(ev, "player", maxDepth, Q, clamp(Math.sqrt(plan / 1500), 0.4, 16));
    ev.cov.player.stage = ev.stage;
  }
  // 도장
  if (appraisal?.ok) {
    const cn = enact(appraisal, { articleId: art.id, ev, title: headline });
    art.decree = cn.id;
  }
  // 경험치·인주
  const xp = Math.round(12 + Q * 4 + sum(trueUsed, (f) => f.depth * 3) + (scoop ? 20 : 0));
  gainXp(xp);
  art.xp = xp;
  art.ink = addInk(clamp(plan / 9000, 0.3, 9) * (0.6 + Q / 10) + (scoop ? 1.5 : 0));

  feed("mine", `${scoop ? "[단독] " : ""}${headline}`, { ev: ev?.id, art: art.id, cat: art.cat });
  emit("article:published", art, ev);
  emit("cash");
  return art;
}
