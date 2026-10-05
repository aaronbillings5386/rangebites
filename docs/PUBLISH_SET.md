# Publish set: keep dev files off here.now

`ship_rangebites_once.py` (on the box, outside this repo) uploads every file under the repo root except `.git/`, `.github/`, `tests/`, `*.md` and a few named files. With the dev tooling added in 20261004b, it would **also upload** `package.json`, `package-lock.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `tools/` and `shot/`, plus `node_modules/` if `npm ci` was ever run in the publish checkout. None of these are secrets, but none should be public.

The proposed change to the ship script (for Aaron to review and apply; it's not applied by this PR):

```diff
-        dirnames[:] = sorted(d for d in dirnames if d not in {'.git', '.github', 'tests'})
+        dirnames[:] = sorted(d for d in dirnames if d not in {'.git', '.github', 'tests', 'node_modules', 'tools', 'shot', 'docs'})
@@ SKIP = {
     "icons/logo-source.png",
+    "package.json",
+    "package-lock.json",
+    "eslint.config.js",
+    ".prettierrc.json",
+    ".prettierignore",
 }
```

Until then, don't run `npm ci` in `/workspace/food-radar-app`. Run it in a separate checkout or worktree, or let CI run it.
