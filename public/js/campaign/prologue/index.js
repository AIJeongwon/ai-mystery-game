// 프롤로그 「시험 전」 — 수능 AI 부정행위 사건의 첫 이틀.
// 줄거리와 조사는 3D 현장에 있다 (data/sites/prologue.js, /site.html?case=prologue).
// 본 게임에서 이 장이 하는 일은 현장까지 데려가는 것뿐이다: 세계지도 → 국가 지도 → 사건 개요 → 현장.
// (docs/roadmap/direction-proposal.md의 진행 순서. 화면은 ui/fieldwork.js와 ui/nation.js가 맡는다.)
const flag = (k) => (g) => Boolean(g.campaign.flags[k]);

export const PROLOGUE = {
  id: "prologue",
  label: "프롤로그 · 시험 전",
  // 현장 취재로 진행하는 장: 경영 화면과 세계 시뮬레이션을 쓰지 않는다 (core/store.js의 FIELD_CHAPTERS와 맞춘다)
  field: true,
  beats: [
    {
      id: "p_entry",
      enter: (api) => api.flag("quietWorld"),
      objective: {
        title: "사건이 난 곳으로 간다",
        hint: (g) => (g.campaign.flags.departed ? "취재는 현장에서 이어진다. 사건 개요에서 현장으로 돌아간다." : "지도에는 개요만 있다. 자세한 것은 현장에서 찾는다."),
        items: [
          { id: "nation", text: "세계지도에서 대한민국을 누른다", check: flag("nationOpened") },
          { id: "case", text: "서울의 사건을 눌러 개요를 읽는다", check: flag("caseSeen") },
          { id: "site", text: "현장으로 간다", check: flag("departed") },
        ],
      },
      // 현장에서 본 게임으로 돌아오는 길은 아직 정하지 않았다. 이 장은 여기서 다음 장으로 넘어가지 않는다.
      done: () => false,
    },
  ],
};
