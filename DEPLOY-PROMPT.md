# Paste this into a fresh Claude Code session on this machine

Ship THE GLASS to GitHub Pages and give me the live link.

The game is at `C:\Users\kylef\Downloads\New folder\the-glass`. It is a browser game with
NO build step: vanilla ES modules plus a vendored `lib/three.module.js`. Do not add a
bundler, a package.json build script, a framework, or a CI workflow. It ships as-is.

Do this:

1. `cd` into that folder and confirm `index.html`, `main.js`, `sim.js`, `view.js`, `ui.js`,
   `sfx.js` and `lib/three.module.js` are all present. If `lib/three.module.js` is missing
   the game will not boot — stop and tell me.

2. Add a `.gitignore` (`node_modules/`, `*.log`, `.DS_Store`, `8*/`) and an empty
   `.nojekyll` file at the repo root — GitHub Pages needs `.nojekyll` or Jekyll can eat
   files it doesn't recognise.

3. `git init` (default branch `main`), commit everything with the message
   `THE GLASS v0.1 — the jar, the life, the blood, the hand, the chronicle`.

4. Create the repo and push:
   - `gh repo create kylefriesmarketing/the-glass --public --source=. --remote=origin --push`
   - If `gh` isn't authenticated, run `gh auth login` and walk me through it.
   - If the repo already exists, add it as `origin` and push instead of failing.

5. Turn on Pages, serving from `main` / root:
   - `gh api -X POST repos/kylefriesmarketing/the-glass/pages -f "source[branch]=main" -f "source[path]=/"`
   - If it 409s (already enabled) that's fine, move on.

6. Wait for it to build, then VERIFY — do not just hand me a URL:
   - poll `https://kylefriesmarketing.github.io/the-glass/` until it returns 200 (give it up
     to 3 minutes; Pages is slow on first publish)
   - also curl `https://kylefriesmarketing.github.io/the-glass/lib/three.module.js` and
     `.../sim.js` and confirm both are 200 and served as JavaScript, not HTML. If they come
     back as HTML you have a path-case problem — the repo is case-sensitive and Windows is not.
   - if you have browser tools, open the live URL, wait 5 seconds, screenshot it, and confirm
     the jar renders with creatures in it and the console has no errors.

7. Report back: the live URL, the repo URL, and what you verified.

Then, only if step 6 passed, do the house-contract housekeeping:
- add `THE GLASS` to `CATALOG.md` in the workspace root under the KID'S BEDROOM section,
  line `F`, doorway "the terrarium on the windowsill", hook: *"don't tap the glass. they can
  hear you."*
- add its brief to `game-briefs/bedroom.md` with `status: shipped (<live url>)`, save key
  `theglass-save`, collectible "a shard of glass with one fingerprint on it".

Notes:
- The game saves to IndexedDB, so it works fine on Pages with no backend.
- `README.md` and `HANDOFF.md` in that folder explain the build; `THE_GLASS_BIBLE.md` is the
  design authority. Don't rewrite any of them.
