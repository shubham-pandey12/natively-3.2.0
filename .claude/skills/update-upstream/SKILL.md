---
name: update-upstream
description: Check for a new Natively upstream release and prepare a reviewed parity update on a dedicated branch.
---

1. Read root `CLAUDE.md`. Run `node scripts/update/check.mjs`. Exit 0 means the baseline is current, 10 means a release is available, and other codes indicate an error.
2. For a new release, confirm the intended installed version and ask the user before running `node scripts/update/prepare.mjs <version>`. Add `--dry-run` to preview the plan. Preparation needs a clean working tree.
3. Review the release's `UPDATE_<version>_REPORT.md`, `UPDATE_<version>_PREMIUM.md` and any `UPDATE_<version>_CONFLICTS.md` in `docs/parity`. If preparation stopped, diagnose the recorded failure before proceeding.
4. Port the required premium changes on the update branch. Match the exact strings, styles and behaviour in the archived production bundle under `natively-releases/<version>/extracted` in the user's home. Leave uncertain behaviour for verification against the installed release.
5. Rerun `npm run parity`. Inspect scenario rows and screenshot pairs. Require every scenario to match after applying `EXPECTED_DIFFERENCES`.
6. Summarise the changes, cross-platform impact, commands and remaining verification using the exact `CLAUDE.md` validation categories. Ask the user before merging.
