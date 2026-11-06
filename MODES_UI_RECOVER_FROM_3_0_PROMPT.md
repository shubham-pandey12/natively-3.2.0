# Recover the Exact Modes Manager UI and Behavior from Natively 3.0 (for Codex)

## Goal

Make the Modes Manager UI and its functionality **exactly the same as Natively 3.0**. Not similar. Not "restored copy." Identical copy, layout, controls, ordering, states, dialogs, behavior, **visual styling, and animations**.

"Animations" includes: transitions and keyframes (CSS, `transition`, `animation`, `@keyframes`), framer-motion or other motion libraries, hover, focus, and press states, enter and exit of rows, dialogs, and banners, loading spinners, and any `prefers-reduced-motion` handling. Recover them exactly. Do not replace them with new easing or durations.

Where the 3.0 UI is not available as source, recover it from the 3.0 build artifacts. Do not guess or reconstruct it from memory or from 2.9.2.

---

## Ground rules

- **Source of truth order:**
  1. The 3.0 source, if it exists under `/Users/shubhampandey/Desktop/Natively-Recovered-Source/recovered/versions/` or in git (`git show v3.0.0:<path>`).
  2. The 3.0.0 installer: `/Users/shubhampandey/Downloads/Natively-3.0.0-arm64.dmg`. Extract its renderer bundle and source maps.
  3. The compiled 3.0 renderer under `/Users/shubhampandey/Desktop/Natively-Recovered-Source/build/` if it is 3.0.
  4. 2.9.2 and 3.1.0 are **not** references for this task. Do not use them to decide copy or layout.
- **Do not write into the DMG or the recovered folders.** Mount or extract read-only, into the session scratchpad only.
- **Do not guess.** If a string, class, or handler cannot be located in the 3.0 artifacts, report it as not recovered. Do not invent it.
- **Preserve the user's in-progress work.** The working tree contains uncommitted edits in `premium/src/ModesSettings.tsx`, `electron/ipcHandlers.ts`, `electron/services/ModesManager.ts`, `src/types/electron.d.ts`, and untracked test and prompt files. Make changes on top of them. Do not revert, reformat, or stage files you did not change for this task. **Do not commit.**
- **Keep the current backend safety fixes** (reserved-mode rejection, built-in deletion guard, `mode_not_found` checks, parented file dialog) unless 3.0 behavior explicitly requires a different result. If it does, list the difference and keep the safer behavior until the user decides.
- **Keep the Technical Interview fallback unchanged** (`electron/services/ModesManager.ts`, around lines 504–534). The user has confirmed it.
- **Cross-platform rule:** Natively ships on macOS and Windows. Note the impact of every change on both. No hardcoded `/tmp`, `~/Library`, or Unix-only shell commands. Use the scratchpad for temp files.
- **Graph tool:** `code-review-graph` is disconnected. Use `grep`, `find`, `Read`, `git show`, and `git log -S`.

---

## Step 1: Find the 3.0 source first

```bash
ls /Users/shubhampandey/Desktop/Natively-Recovered-Source/recovered/versions/
cd /Users/shubhampandey/testing/natively-cluely-ai-assistant
git show v3.0.0:src/components/settings/ModesSettings.tsx | head -20
git ls-tree -r --name-only v3.0.0 | grep -i "modes" | head -40
```

Note: at tag `v3.0.0`, `src/components/settings/ModesSettings.tsx` is a stub that re-exports `../../premium`. The real implementation is in the private `premium` submodule, and the premium tags do not contain it. So the stub alone is not enough.

Record for each candidate: path, size, and whether it contains `Reference Documents`, `Available Modes`, `Save Changes`, `Customize assistant behaviors`.

---

## Step 2: Extract the 3.0.0 installer read-only

```bash
SCRATCH=/private/tmp/claude-501/-Users-shubhampandey-testing-natively-cluely-ai-assistant/40d38807-3026-4146-a93a-64f4decbf3e4/scratchpad
mkdir -p "$SCRATCH/dmg30"
hdiutil attach -readonly -nobrowse -mountpoint "$SCRATCH/dmg30/mnt" /Users/shubhampandey/Downloads/Natively-3.0.0-arm64.dmg
```

From the mounted app bundle (`.../Natively.app/Contents/Resources/`):
- Copy `app.asar` into `$SCRATCH/dmg30/` (copy, do not run from the mount).
- Extract it with `npx --yes @electron/asar extract "$SCRATCH/dmg30/app.asar" "$SCRATCH/dmg30/app"`.
- Detach when done: `hdiutil detach "$SCRATCH/dmg30/mnt"`.

If the asar is unpacked (`app.asar.unpacked`), copy that too.

Then search the extracted renderer:

```bash
grep -rl "Reference Documents\|Available Modes\|Customize assistant behaviors" "$SCRATCH/dmg30/app" 2>/dev/null
```

For each hit, list the bundle file and check for a source map (`*.map`). If a `.map` exists, extract `sourcesContent` for the modes files:

```bash
node -e 'const m=require(process.argv[1]);m.sources.forEach((s,i)=>{if(/[Mm]odes/.test(s))console.log(s)})' "<file>.map"
```

Write each recovered source to `$SCRATCH/recovered-3.0/<original path>`.

If there is no source map, the bundle is minified. Locate the Modes component by its copy strings, then reconstruct its JSX with a formatter (`npx --yes prettier --parser babel`) into the scratchpad. Mark every reconstructed block as **reconstructed from minified bundle**, not as source.

---

## Step 3: Build the 3.0 specification

From the recovered 3.0 source or formatted bundle, write `$SCRATCH/modes-3.0-spec.md` with:

1. Every visible string, in order, with its location. Include headings, labels, placeholders, button text, helper text, empty states, error messages, and confirmation text.
2. Every control and its state rules: which are disabled for built-in modes, which are hidden, which are shown only for custom modes.
3. Every IPC call the component makes, with the argument shape and how the response is handled.
4. Every state transition: create, rename, delete, activate, save context, upload reference file, delete reference file, note section actions, save changes.
5. Layout: section order, container structure, and the class names or inline styles in use.
6. Visual styling for each element: colors (token or literal), typography (size, weight, line height, letter spacing), spacing, borders, radii, shadows, icon size and glyph, and the active, hover, focus, disabled, and error states.
7. Animations: every transition, keyframe, and motion-library call, with its trigger, duration, easing, delay, and enter/exit behavior. Include the reduced-motion branch if one exists.

Do not write the spec from memory. Each line needs a source reference.

---

## Step 4: Compare with the current UI

Current file: `premium/src/ModesSettings.tsx` (uncommitted edits present).

For every row in the spec, record: 3.0 reference, current location (file:line), current text or behavior, and match status.

Use the agent-browser harness from `CLAUDE.md` to capture the **current** Modes panel in each state. Open Settings through the launcher window. Confirm the document with `agent-browser eval "location.search"`. Never use `--auto-connect`.

For styling, use `agent-browser eval` to read `getComputedStyle` for each spec element (color, font, size, weight, padding, margin, border, radius, shadow) and compare with the 3.0 values. For animations, record the computed `transition` and `animation` values and the timing of enter and exit, and compare with the 3.0 spec. Capture frames at the start, middle, and end of at least the dialog open, row enter, and banner show animations.

If the 3.0 app can be launched from the DMG or the recovered build, capture the same states from it. Otherwise say the 3.0 comparison is from source, not from a rendered screenshot.

---

## Step 5: Port the exact 3.0 UI

- Replace the current Modes UI markup, copy, and layout in `premium/src/ModesSettings.tsx` with the 3.0 version. Keep the existing IPC names that are present in both versions.
- Where 3.0 has behavior that the current backend does not support, add the minimum backend support, and note it.
- Where the current version has features 3.0 does not have (for example, source contract, answer policy V3, indexing status), list each one. Do not remove any silently. Keep it and flag it as "current-only," unless the user says to remove it.
- Do not redesign. Do not "improve" copy. Do not change spacing, colors, typography, icons, or animations that 3.0 has.
- Styles and animations that the 3.0 bundle loads from a shared stylesheet or a global theme file must be carried over with the same values. Note the file each one comes from. If a style depends on a global token that the current app defines differently, do not change the global token for everyone. Scope the fix to the Modes component and list the global conflict in the report.
- If a 3.0 animation depends on a library that is not installed in the current repo, check `package.json` in the current repo. Add the same library at the same version only if it is already a project dependency or the user approves. Otherwise recreate the exact keyframes and timing in CSS and list it.

---

## Step 6: Tests

- Add a test that asserts every visible 3.0 string from the spec is present in the component, in order.
- Add a test per control state rule (disabled for built-ins, hidden for non-custom).
- Add a test that asserts each recovered style value and animation duration/easing from the spec is present in the component or its stylesheet.
- Keep all existing Modes tests passing, unless a test asserts a current-only behavior that the 3.0 spec removes. List those and do not change them without asking.

---

## Validation

```bash
npx tsc --noEmit
npx tsc --project electron/tsconfig.premium-check.json --noEmit
npm run build:electron
npm run test:modes:no-build
npm run test:company-research-spend
npm test
```

Also run the Electron-hosted Modes suite:

```bash
node scripts/run-with-env.mjs --default-tmpdir NATIVELY_TEST_USERDATA=natively-test-userdata --default-tmpdir CODEX_HOME=natively-test-codex-home --set ELECTRON_RUN_AS_NODE=1 -- electron --test electron/services/__tests__/ModesManager*.test.mjs electron/services/__tests__/ModeBleeding*.test.mjs electron/services/__tests__/CustomModes.test.mjs electron/services/__tests__/ModeSourceContract.test.mjs electron/services/__tests__/ModeGenerator.test.mjs electron/services/__tests__/ModeUploadHardening.test.mjs
```

Report the exit code of each command. If `npm test` is killed (exit 137) or times out, rerun it on its own and report the result. Do not report a pass without a summary line.

---

## Report

### 1. 3.0 source located
Each candidate: path, source or reconstructed, and what it contains. State the source you used.

### 2. Extraction log
DMG mount, asar extraction, detach. Any step that failed.

### 3. Spec
Path to `modes-3.0-spec.md`, with the count of visible strings and controls.

### 4. Comparison
Table: element | 3.0 reference | current file:line | current text, style, or animation | match | action.

Include a separate table for styles (computed values) and one for animations (duration, easing, delay, trigger, reduced-motion behavior).

### 5. Changes made
File, what changed, and platform impact (macOS / Windows).

### 6. Current-only features kept
List, with reason.

### 7. Not recovered
Anything in 3.0 that could not be located in the source or the bundle.

### 8. Validation
Each command with exit code.

### 9. Not verified
- Side-by-side rendered screenshots if the 3.0 app could not be launched
- Windows rendering and native file dialogs
- Live provider flows

---

## Success criteria

- The 3.0 source or bundle was located and extracted read-only, and the source of every spec line is recorded
- Every row in the comparison is "match" or has an explicit, approved reason to differ
- The current UI matches the 3.0 spec for copy, layout, control states, computed styles, and animations (durations, easing, delays, and enter/exit behavior)
- No backend safety fix or the Technical Interview fallback was removed without a listed reason
- All validation commands exit 0, or their failure is explained
- Nothing committed; user's edits intact
