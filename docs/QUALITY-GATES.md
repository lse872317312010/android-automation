# CI/CD and test-environment-first quality strategy

- Date: 2026-10-22
- Status: **Policy approved; stages are implemented incrementally**
- Owner repository: `lse872317312010/android-automation`
- Applies to: policy core, orchestration/state machine, workflow/Skill contracts, device adapters, AI repair proposal interfaces and release pipeline.

## What "0 bug above the hardware layer" can responsibly mean

Absolute zero defects in arbitrary code or game/OEM versions is **not demonstrable** with unit tests. Our measurable release policy is:

- **0 known open P0/P1 bugs** at release time; no intentionally skipped safety-critical tests.
- **100% mandatory CI checks pass** on the exact commit; do not merge/release when CI is red. GitHub-enforced merge blocking additionally requires the pending branch protection ruleset below.
- **0 unsafe input actions** in all negative/property/fault-injection scenarios.
- **0 false claims of completion** in all controlled fixtures; observed, input-requested and completed states remain distinct.
- All required features must have contract tests, a failure-path test and documented device acceptance if they touch OS-specific APIs.
- Source changes must pass static syntax checks and a deterministic generated-artifact check.
- Coverage is a *threshold*, not proof of absence of bugs; improve over time rather than gaming the metric.
- Tests and production artifacts contain no private screenshots, credentials or account identifiers.

## Test pyramid and boundaries

| Tier | Environment | Verified | What it cannot prove | Automatic gate |
| --- | --- | --- | --- | --- |
| T0 | Node 20 / 22 hosted runners | Parse/syntax, invariant/property tests, error semantics, deterministic replay | AutoJs6 Rhino syntax quirks and Android API behavior | Required PR+main |
| T1 | Offline simulated adapter + synthetic OCR frame sequences | One-action maximum, no invalid tap, cancellation/timeout, stale frame, expected state, package/rotation | Real visual accuracy, Shizuku availability | Required PR+main |
| T2 | Offline screenshot corpus, annotated and sanitized | OCR/CV scene classification, template drift, false positives and negatives | Correct physical touch | Required once corpus exists (not claimed implemented) |
| T3 | Android emulator / instrumented test app | API 30 framework contracts, inert Rhino host, native fixture screenshot/input semantics | Production AutoJs6 capture/OCR/Shizuku path, Xiaomi OS policies, physical thermal behavior, Star Rail version | Partial hosted framework gate |
| T4 | Physical Redmi with AutoJs6 + Shizuku | MediaProjection, permissions, OEM scheduling, real gesture, scroll, focus and UI verifier | Reproducibility on all devices | Explicit device acceptance required for "Redmi verified" label |
| T5 | Live Star Rail bounded scenarios | Actual task entry/exit, benign input, semantically verified outcome, compatibility | Every future hot update/game server event | Required before any claim of game daily support |
| T6 | AI candidate repair evaluation | Safe suggestion format, replay, rollback/approval controls | Safe autonomous production deployment | Planned before AI feature goes live |

The merged code covers T0/T1 and a **partial T3 harness**: 30 shared script scenarios run through pinned AutoJs6 Rhino on API 30 with inert capture/OCR/Shizuku, plus real Android Bitmap/file contracts and a separate native fixture screen test. The native fixture screenshot and injected gesture do not exercise the production JavaScript adapter. Production-adapter T3, T2/T4/T5/T6 remain unverified. See the [current execution queue](ROADMAP.md#current-execution-queue-2026-10-26) and [harness scope](../android-harness/README.md). GitHub Actions is not a physical-device test.

## Implemented CI policy and remaining release controls

- GitHub Actions on every push/PR/dispatch; **including docs/quality changes**, with `permissions: contents: read`.
- Node LTS matrix (20, 22) executes all `test/*.test.cjs` without internet/dependency installations.
- Parse-check `src/core.js`, `src/android.js`, `build.mjs`, the draft manifest validator and `dist/AndroidAutomation.js`.
- Run safety property/fault-injection tests against a mocked device adapter.
- Rebuild `dist/AndroidAutomation.js` from `src/...`; fail if the generated bundle differs from committed source.
- Node22 produces native V8 coverage and enforces **initial** line/branch/function thresholds, with subsequent raises after measuring the baseline.
- Upload the exact bundled JS artifact for review. This is **a script, not a signed APK**.
- PR merge and tagged candidate releases must not bypass test/coverage/generation gates.
- A successful main-branch API 30 workflow publishes a commit-bound, debug-signed test APK, bundled script, framework receipt and checksums as a GitHub prerelease. This is not a stable product build or hardware approval.
- Production-device support requires a separate signed manual acceptance record; no automated stable release until that workflow exists.
- The M2 contract ships a strict draft-only JSON Schema, parser and metadata-only compatibility assessor in the AutoJs6 bundle. `validateCompatibilityContext` reports stable field-level codes without echoing caller values; malformed metadata blocks. A full compatibility match is only `compatible_for_fixture_review` with `activationAllowed: false`. Node/Rhino/API 30 tests cover both paths. There is no device attestation, Skill loader or executor.

## Required repository branch rule (administrative setting; not yet confirmed enabled)

The workflows actively **fail on bad code**, but GitHub Actions alone does **not** guarantee that GitHub rejects merges/direct pushes. Configure GitHub **Settings → Rules → Rulesets** (or branch protection) for `main`:

- Require pull requests and the latest head to be up-to-date before merging.
- Require successful checks `Node 20 / policy + simulator` and `Node 22 / policy + simulator`.
- Block force-push and deletion of `main`; avoid bypassing checks for administrators.
- Record a successful branch-rule verification with a deliberately failing test on a disposable PR, then discard that PR.

The connected GitHub account has repository admin permission, but the active connector exposes rule reads and no branch-rule mutation operation. **Administrative enforcement remains pending** until configured through a write-capable GitHub interface and verified with a disposable failing PR. Until then, call these *automated checks*, not *enforced branch protection*.

## Deterministic simulation fixtures

`test/invariants.test.cjs` provides seeded reproducible property checks; `test/core.test.cjs` remains the example/edge-case suite.

Required matrix:
1. Valid one-click, two-frame verified postcondition.
2. Two matching OCR targets, weak confidence, malformed/out-of-bounds rectangles → **zero input**.
3. Changed foreground package, stale frame, rotation, cropped capture, timeout, cancellation → **zero input**.
4. Already-finished state → **zero input** and `ALREADY_AT_RESULT`.
5. Failed or uncertain tap → at most one request, never retry.
6. Wrong nonce/false positive, intermittently matching result → never `verified` without consecutive matches.
7. Read-only probe must remain action incapable, including under adversarial OCR and interruption.
8. APK version unknown/first-seen/changed/unchanged per package; no cross-channel reuse.
9. Action report `action_requested` must not become `completed` without independent postconditions.
10. Replay same seed and fixture should produce same trace; failing seeds should be captured in CI logs.

Follow-on tests once Skill Runtime exists:
- Unknown/unsigned/incorrect-hash/overprivileged Skill → no install/execute.
- Graph validation rejects cycles without budgets, missing node, unsupported action, unknown action and unbounded retries.
- Version compatibility for APK and UI signature; isolated per-game disablement and rollback.
- AI candidate cannot bypass approval, verification or capability gate.
- Start/stop/resume is idempotent by task ID, with conservative recovery on non-idempotent actions.
- Changed shared recognizer executes regression for every dependent Skill.

## Severity and gates

- **P0**: privacy leak, unexpected privileged operation, irreversible unsafe input, credential leakage; halt release immediately.
- **P1**: false "completed", unbounded actions, wrong app touched, invalid rollback, repeated non-idempotent input; halt release.
- **P2**: incorrect detection/retry blocked without unsafe side effect, missed task, isolated regression; fix before promoting that Skill.
- **P3**: usability, missing optional metadata and performance findings; documented and tracked.

Require safety review for any diff touching adapter privileges, Android shell, external model IO, command execution, release signature, work scheduling or game input. Prefer one action per transaction with an explicit verification ledger.

## Physical-device acceptance checklist (not automated)

Record without account-identifying data:
- Device hardware model, Android and MIUI/HyperOS versions (only if consented), AutoJs6/JavaScript version and Shizuku authorization state.
- Capture permission reject/grant, correct fullscreen capture and matching screen geometry.
- Foreground switch and orientation change while a run is pending.
- Shizuku revoked/restarted; input failure; UI/hardware Stop behavior.
- App in background and after OEM kills it; cold relaunch as `interrupted` not `completed`.
- Benign test fixture: unique nonce before/action/two stable result frames; no manual interference.
- Star Rail read-only OCR screen and button candidate counts; live game single step only after explicit user request.
- p50/p95 capture, OCR, input and verify latency; task duration; measured power only with comparable workloads.
- Save redacted `runId`, client package/version status and failure codes, not full raw dump.
- A checkbox for user consent to each game test and note that game operators may restrict automation.

## Release process

```text
change → PR → T0/T1 + applicable Rhino/API 30 gates green → merge
  → commit-bound debug fixture APK + script + SHA256SUMS in GitHub Releases
  → T2/T3 + T4/T5 manual evidence as required
  → explicit promote to a signed device-verified Skill version
  → monitored roll-out, rollback on failure
```

The APK is a test harness and requires the official AutoJs6 runtime to run the bundled script. It is not a production automation host.

No release/CI status can prove "0 bug" in untested OS, game or network conditions. Implementing T0/T1 first is deliberate: it makes every subsequent feature testable before privileged-device interaction.

## Pre-input TOCTOU and OCR timestamp regression (2026-10-22)

- The privileged input boundary performs a second foreground and screen geometry check immediately before requesting Shizuku input. The portable policy independently rechecks after persisting `action_requested`, because persistence may yield, fail, or outlive the expected foreground.
- The portable policy rejects OCR capture timestamps of the wrong type, non-finite age, timestamps from the future, or ages above 2500 ms. These failure paths have explicit zero-input regression tests.
- Rechecks reduce time-of-check/time-of-use exposure; no JavaScript check can make Android focus and the later shell injection atomic. The Redmi acceptance gate must still cover intentional focus switching while injection is pending.
- These regressions run under Node mocks. They do **not** increase Android host code coverage, do not substitute for Android emulator validation, and do not establish 0 bugs on real hardware.

## T1 host contract simulator (new PR validation)

`test/host.test.cjs` boots the actual AutoJs6 entrypoint in a Node VM with deliberately inert stubs for `ui`, screenshot, OCR, Shizuku, filesystem and Android geometry. This exercises fixture verification, Star Rail read-only mode, refused permissions, last-moment focus/rotation changes and uncertain injection. Mocked input never reaches Android or a network. CI runs it with the existing `test/*.test.cjs` suite, and the workflow explicitly checks its JavaScript syntax.

VM behavior only approximates AutoJs6 APIs and cannot prove OEM, Shizuku, or Rhino compatibility; T3/T4 device runtime acceptance remains a distinct blocker.

## Final persistence boundary and acceptance evidence

The adapter writes intent before input; this final persistence can itself yield.
It now rechecks cancellation, deadline, foreground, geometry and OCR age after
that write, immediately before the shell request. The portable policy also
checks OCR age again after its own stage persistence. Five baseline-red
regressions assert zero delivered input under these races. OS injection still
cannot be atomic with JavaScript foreground checks.

`evidence/README.md` defines eight physical smoke scenarios and a pending template.
`tool/validate-acceptance.cjs` checks exact commit/script binding, unique runs,
conservative status semantics and a privacy field allowlist. It validates
operator assertions for review; it does not authenticate hardware or promote a
release. CI retains JUnit output from synthetic T0/T1 tests for each Node version.

## Pinned engine and regression sensitivity

See [Runtime testing](RUNTIME-TESTING.md). The actual AutoJs6 6.7.0 bundled Rhino
jar now executes the committed script in a desktop JVM against 28 inert scenarios.
This detects engine incompatibility beyond V8 parsing; Android-specific classes,
permissions, native OCR and concurrency are still outside its evidence boundary.
The same fixtures run in Node. Ten deliberate bad changes must each fail a real
test; syntax errors and infrastructure failures do not count as detection.

Expanded tests exposed raw uppercase exception export and delete-before-rename
baseline loss. Both are fixed and have baseline-red regression cases. Local
suite: 77 tests plus 28 Rhino scenarios, with 10/10 targeted mutants detected.
No emulator, physical-device or production-release status is implied.