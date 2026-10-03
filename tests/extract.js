// Pull named top-level helper functions/consts out of app.js / deals.js source text and eval them in a
// sandbox. No test hooks are added to production code. Node >= 18, no dependencies.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function grabBlock(src, startIdx) {
  let i = src.indexOf("{", startIdx), depth = 0, q = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === "\\") { i++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === "`") { q = c; continue; }
    if (c === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); continue; }
    if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i) + 1; continue; }
    if (c === "/") {
      // Regex literal if the previous significant char can't end an expression.
      let j = i - 1;
      while (j >= 0 && /\s/.test(src[j])) j--;
      const prev = src[j];
      const word = /[A-Za-z_$]+$/.exec(src.slice(Math.max(0, j - 10), j + 1));
      if (!prev || "(,=:[!&|?{};+-*%<>~^".indexOf(prev) >= 0 || (word && /^(return|typeof|case|in|of)$/.test(word[0]))) {
        let k = i + 1, cls = false;
        for (; k < src.length; k++) {
          const d = src[k];
          if (d === "\\") { k++; continue; }
          if (d === "[") cls = true; else if (d === "]") cls = false;
          else if (d === "/" && !cls) break;
        }
        i = k;
        continue;
      }
    }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return i + 1; }
  }
  throw new Error("unbalanced");
}
function fn(src, name) {
  const re = new RegExp("\\n\\s*(async\\s+)?function " + name + "\\s*\\(");
  const m = re.exec(src);
  if (!m) throw new Error("function not found: " + name);
  return src.slice(m.index, grabBlock(src, m.index));
}
function constDecl(src, name) {
  const re = new RegExp("\\n\\s*const " + name + "\\s*=");
  const m = re.exec(src);
  if (!m) throw new Error("const not found: " + name);
  const eq = src.indexOf("=", m.index);
  const after = src.slice(eq + 1).trimStart();
  if (after[0] === "{" || after[0] === "[") {
    const open = src.indexOf(after[0], eq);
    const closeCh = after[0] === "{" ? "}" : "]";
    let depth = 0, i = open;
    for (; i < src.length; i++) { if (src[i] === after[0]) depth++; else if (src[i] === closeCh && --depth === 0) break; }
    return src.slice(m.index, src.indexOf(";", i) + 1);
  }
  return src.slice(m.index, src.indexOf(";", eq) + 1);
}
function load(file, fns, consts, extra) {
  const src = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const code = (extra || "") + "\n" + (consts || []).map((c) => constDecl(src, c)).join("\n") + "\n" +
    fns.map((f) => fn(src, f)).join("\n") + "\n;({" + fns.join(",") + "})";
  return vm.runInNewContext(code, { console, Math, Number, String, Object, Array, RegExp, JSON, Date });
}
module.exports = { load };
