// ESLint flat config (dev only; not published). Browser files are classic scripts (no bundler).
"use strict";
const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  { ignores: ["vendor/**", "node_modules/**", "shot/**", "data/**", "**/*.min.js"] },
  js.configs.recommended,
  {
    files: ["*.js", "themes/**/*.js"],
    ignores: ["sw.js", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { ...globals.browser, L: "readonly", module: "readonly", require: "readonly" },
    },
  },
  {
    files: ["sw.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "script", globals: { ...globals.serviceworker } },
  },
  {
    files: ["eslint.config.js", "tests/**/*.js", "tools/**/*.js", "tools/**/*.mjs"],
    languageOptions: { ecmaVersion: 2022, sourceType: "commonjs", globals: { ...globals.node } },
  },
  {
    rules: {
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
];
