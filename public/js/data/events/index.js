// 사건 유형 모음. 새 유형은 분야 파일에 항목을 더하면 된다.
// 주의: 아래 펼치는 순서와 각 파일 안의 항목 순서가 무작위 뽑기의 순서다. 순서를 바꾸면 같은 씨앗에서도 세계가 달라진다.
import pol from "./pol.js";
import eco from "./eco.js";
import soc from "./soc.js";
import sci from "./sci.js";
import int from "./int.js";
import cul from "./cul.js";
import med from "./med.js";
import special from "./special.js";

export const EVENT_TYPES = { ...pol, ...eco, ...soc, ...sci, ...int, ...cul, ...med, ...special };

// 평소에 저절로 생기는 유형 (여파·집단 기억 불일치는 조건이 맞을 때만 따로 생긴다)
export const EVENT_TYPE_KEYS = Object.keys(EVENT_TYPES).filter((k) => !["rift", "aftermath"].includes(k));
