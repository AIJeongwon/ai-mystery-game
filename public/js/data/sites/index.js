// 열 수 있는 무대의 목록: 3D 현장과, 기록을 펼쳐 읽는 책상
import { SITES as ROOMS } from "./mokwon.js";
import { MOKWON_DESK } from "./mokwon-desk.js";
import { PROLOGUE, PROLOGUE_SITES } from "./prologue.js";

export const SITES = { ...PROLOGUE_SITES, ...ROOMS, [MOKWON_DESK.id]: MOKWON_DESK };
// 여러 장소를 오가는 사건: ?case=prologue 로 열면 있던 장소에서 이어 간다
export const CASES = { [PROLOGUE.id]: PROLOGUE };
