// 도크의 서랍 목록 — 위에서부터의 순서가 도크에 놓이는 순서다.
// 새 서랍을 넣으려면: (1) 여기에 한 줄을 더하고 (2) ui/panels.js의 RENDER에 그리는 함수를 등록한다.
//   key     서랍의 이름. 열 때 emit("ui:drawer", key)
//   icon    ui/dom.js의 아이콘 이름
//   label   도크에 보이는 글자
//   locked  (선택) 게임 상태를 받아, 아직 열 수 없으면 true를 돌려준다
//   bottom  (선택) 도크의 아래쪽에 따로 놓는다
export const DRAWERS = [
  { key: "leads", icon: "lead", label: "단서" },
  { key: "world", icon: "calendar", label: "세계" },
  { key: "articles", icon: "article", label: "기사" },
  { key: "manage", icon: "manage", label: "경영" },
  { key: "rank", icon: "rank", label: "순위" },
  { key: "canon", icon: "stamp", label: "記定", locked: (g) => !g.canon.unlocked },
  { key: "case", icon: "case", label: "사건", locked: (g) => !g.campaign.flags.caseOpen },
  { key: "menu", icon: "menu", label: "메뉴", bottom: true },
];
