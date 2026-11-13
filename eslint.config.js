// 린트 설정 — 형식(들여쓰기·따옴표)은 보지 않고, 실행 중에야 드러나는 실수만 잡는다.
// 특히 no-undef: 파일을 나누거나 옮기다가 가져오기를 빠뜨리면 그 줄이 실행될 때에야 터지는데, 이것을 미리 잡는다.
import globals from "globals";

const rules = {
  "no-undef": "error",
  "no-unused-vars": ["warn", { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" }],
  "no-const-assign": "error",
  "no-dupe-keys": "error",
  "no-dupe-args": "error",
  "no-dupe-class-members": "error",
  "no-redeclare": "error",
  "no-import-assign": "error",
  "no-unreachable": "error",
  "no-self-assign": "error",
  "no-shadow-restricted-names": "error",
  "no-func-assign": "error",
  "no-obj-calls": "error",
  "use-isnan": "error",
  "valid-typeof": "error",
  "getter-return": "error",
  "no-cond-assign": ["error", "except-parens"],
};

export default [
  { ignores: ["node_modules/**", "public/assets/**", "tools/_raw/**", "tools/bin/**", ".backup/**"] },
  {
    // 브라우저에서 도는 코드. d3·topojson은 index.html이 먼저 읽는 전역이다.
    files: ["public/js/**/*.js"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: { ...globals.browser, d3: "readonly", topojson: "readonly" } },
    rules,
  },
  {
    // Node에서 도는 코드: 서버, 도구, 시험, 설정
    files: ["server/**/*.js", "tools/**/*.mjs", "tests/**/*.mjs", "*.js", "*.mjs"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: { ...globals.node } },
    rules,
  },
];
