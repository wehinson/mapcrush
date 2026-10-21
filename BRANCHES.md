# MapCrush work log

## 2026-10-21 — Preserve edits during shared-country actions

- Agent: Codex, hosted cloud workspace; sole implementation owner.
- Status: Ready With Caveat — unmerged task PR for review; no deployment.
- Base: `working` at `14375f8cacf41e9d2572d39d872ee2f6b542cf25`.
- Task branch: `task/preserve-profile-edits-shared-actions-20261021` (targets `working`).
- Change: reuse the canonical merge for shared responses, retain dirty/newer profiles and current actor, keep revisions/shared state monotonic across delayed save responses, and invalidate both profiles' removed-country pairs.
- Tests: actual application declarations in a Node VM, deferred synthetic fetch, actual Worker mutation functions; only DOM leaf rendering/timers stubbed. No browser or production requests.
- Exact-base reproduction: `git show 14375f8cacf41e9d2572d39d872ee2f6b542cf25:public/js/script.js > /tmp/mapcrush-base-script.js`, then `MAPCRUSH_SCRIPT=/tmp/mapcrush-base-script.js node --test tests/shared-actions.test.mjs`: 13 tests, 1 pass / 12 fail (exit 1); primary reproduction loses rounds 2 back to 1.
- Fixed verification: `npm test`: 19/19 pass (13 handler regressions plus all 6 existing Worker tests). `npm run check` and `git diff --check`: pass.
- Coverage: ranking/rounds/comment/love retention and later persistence, no-edit canonical adoption, dirty-before-send, both actors/switching, removed-pair invalidation/regeneration, all four save/action server/response order combinations, stale clean-profile snapshot, delayed pre-removal save response, and preserved 409 conflict handling when a removal precedes an old profile save.
- Limitations: browser layout/interactions not verified. Existing 409 conflict workflow still requires the user's existing reload/export decision; no automatic conflict-policy change. No build, lint, typecheck or CI workflow exists in this source tree; npm check is its syntax check. npm reports an environment http-proxy deprecation warning, without failing checks.
- Preflight: clean checkout, no existing claim, no repository AGENTS/BOTS files, no open PRs; README/package/docs inspected. Main and working tips match the opening brief. Shell push lacks credentials; authenticated GitHub connector created the task branch at the exact base and is used for backup/PR.
- Version impact: no release bump before shipping. Pending unrelated working commits remain untouched. No retry mutation-identity work.
