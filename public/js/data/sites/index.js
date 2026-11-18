// 열 수 있는 무대의 목록: 3D 현장과, 기록을 펼쳐 읽는 책상
import { SITES as ROOMS } from "./mokwon.js";
import { MOKWON_DESK } from "./mokwon-desk.js";

export const SITES = { ...ROOMS, [MOKWON_DESK.id]: MOKWON_DESK };
