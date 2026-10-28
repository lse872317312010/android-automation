# Android game automation roadmap — quality gates first

Updated 2026-10-26. Execution repo intentionally separate from Personal OS.
Source of truth: [ADR-0001](ADR-0001-reliable-game-agent.md) · [Quality](QUALITY-GATES.md) · [Research](GAME-AGENT-RESEARCH.md).

## Priority and status

| Phase | Priority | Engineering goal | Exit evidence | Status |
| --- | --- | --- | --- | --- |
| **M0: CI/CD & test harness** | **P0: do first** | Node LTS test matrix, deterministic mocked device and seeded fault injection; coverage/syntax/generator consistency gates; release candidate checksum; test/evidence convention | Green mandatory GitHub Actions on exact merge SHA; reproducible artifact and checksum; no unknown unsafe tap in negative scenarios | **In progress** |
| **M1: native Redmi smoke acceptance** | P0 after M0 | AutoJs6 6.7.0 + Shizuku permission, capture, OCR, one user-approved action, verification, safe stop, recover interrupted | Redacted report from physical Redmi and user-observed test, separate from offline CI | Not done |
| **M2: Skill Runtime / isolation** | P1 | Data-first Skill manifest, JSON schema, parser, capability-gated executor, compatibility registry, screenshots/visual signature, scoped error and rollback | Install two fixture Skills; reject unsigned/malformed/incompatible; safe rollback, no cross-game impact | Draft schema/parser, compatibility assessor and in-memory registry checks; no loader or executor |
| **M3: Star Rail vertical slice** | P1 | One low-risk daily-path Skill with game package+locale checks, ROI/templates/OCR, deterministic postconditions; no blind clicks | Success/failure evidence on Redmi and fixture regression across version changes | Not done |
| **M4: AI repair and memory** | P2 | failure classifier, experience retrieval (AgentRR pattern), AI repair candidate (Mobile-Agent-E pattern), Maa-native graph proposal (MaaFwPhoneAI pattern) | Changes in 3 synthetic UI families produce non-privileged candidates, pass old/new regression + explicit review; no direct AI tap | Not done |
| **M5: upstream & lifecycle** | P2 | Monitor StarRailCopilot / March7thAssistant task changes, extract candidate asset diffs, CI-based review, signed staged resources and rollback | Upstream change → review PR → test → signed candidate → device acceptance | Not done |
| **M6: 10-game scheduler/energy** | P3 | Sequential task queue, per-game time/energy budgets, doze/screen strategy, throttling, logs; Oracle optional planner | Per-game isolation, measured Wh/day and retry budgets on phone | Not done |

## M0 concrete backlog / test work

Initial branch gate result (2026-10-22): **28/28 Node tests passed**, plus 512 unsafe-input scenarios, 128 valid deterministic flows and 128 read-only OCR variations. Pure `src/core.js` V8 coverage: **100% lines, 90.10% branches, 100% functions**; excludes Android host and game engine. Node 20/22 workflow matrix green. Results will be rechecked after the merge.

- [x] Create ADR and research references
- [x] Adopt zero-known-P0/P1 release policy (not unprovable absolute zero bugs)
- [x] Harden GitHub Actions to run all tests on Node 20/22, validate bundles, require coverage (100% lines/functions and >=90% branches for src/core.js)
- [x] Build reproducible seeded negative/positive scenario tests and fault injection (512 negative + 128 valid + 128 read-only variants)
- [x] Configure tag-driven **candidate only** CD with SHA256 and generated release notes (workflow committed; actual tag-triggered release not yet exercised)
- [x] Verify Node 20/22 CI on merged main `88212103efa994ebe07a2d0fed218adbd4e08541`, run #39732916633 (37 tests). Later changes require their own exact-head checks.
- [ ] Require passing checks in a GitHub main-branch ruleset (admin setting not available in current connector; see QUALITY-GATES.md)
- [x] Define a pending real-device template and offline validator; synthetic/pending records, artifact mismatches and unsafe outcomes are rejected. A valid operator assertion is only `ready_for_review`; no hardware evidence is supplied by this change.
- [x] Add Android framework-contract emulator harness (PR #8 merged; Rect/Bitmap/rename and pinned Rhino contracts only)
- [ ] Complete native UI and production capture/permission/input adapter acceptance (framework contracts alone do not complete T3)
- [ ] Validate hardware permissions and actual game input on Redmi (M1, never simulated by CI)

Checklist intentionally records a plan; completion of a doc file alone does not mark code/tests complete. Update statuses based on merged CI and physical evidence.

## Planned runtime interfaces (the draft validator does not implement runtime loading)

```ts
type SkillIdentity = {
  gameId: string;
  skillId: string;
  skillVersion: string;
  uiProfile: string;
};

type Compatibility = {
  packageAllowlist: string[];
  apkVersionCodeRange?: [string, string];
  uiAnchors: string[];
  deviceCapabilities: string[];
  locale: string;
  engineAbi: string;
};

type RepairProposal = {
  failingSkillVersion: string;
  failureEvidenceId: string; // sanitized
  changedComponents: string[];
  candidateManifestHash: string;
  rationale: string;
  regressionCases: string[];
  status: "pending_review";
};

type ExecutionEvidence = {
  runId: string;
  actionRequested: number;
  postconditionVerified: boolean;
  completed: boolean;
  deviceValidation: "not_established" | "fixture_observed_only" | "read_only_observed_only" | "device_verified";
};
```

The draft schema and parser only validate data and reject activation. A version registry, runtime loader/executor, repair API and Personal OS integration remain separate deliverables; none exist in the v0.3 script.

### Current continuation (2026-10-22)

- Added five regressions which fail on baseline `8821210`: report persistence can
  expire OCR data or allow focus, rotation or cancellation to change just before
  the adapter submits input. Recheck after the final write and reject stale data.
- Added seven acceptance-record validator tests. Local suite now has 49 tests;
  CI evidence for this change must be recorded on its exact PR head.
- CI retains synthetic/offline JUnit output for Node 20 and 22. These artifacts
  describe T0/T1, not Android or physical-device results.
- No Android SDK, adb or emulator was present in the development container at
  inspection time. Full production-adapter T3 and T4 remain pending. PR #8 subsequently added hosted framework instrumentation and test-only APKs; no product APK was built.
- Main branch-rule enforcement and disposable failing-PR verification remain
  pending. See issue #5 for the remaining P0 work.

### Hardware-free continuation: actual engine and failure sensitivity

- PR #6 merged after confirming its exact head's Node 20/22 checks.
- Shared fault matrix boots the committed bundle in Node and the pinned Rhino
  engine shipped with AutoJs6 6.7.0. Local suite expands to 77 Node tests and
  28 Rhino scenarios; 10 deliberately broken safety/verification paths are all
  detected by tests. See [runtime evidence scope](RUNTIME-TESTING.md).
- New baseline-red regressions fix exception-code disclosure and losing a valid
  baseline when replacement rename fails. Owned-image cleanup, write failures,
  duplicate starts, cancellation, cold restart and ignored input are exercised.
- PR/main CI and candidate CD gain runtime and mutation gates; retain results.
  These remain T0/T1 evidence. Hosted framework instrumentation subsequently adds partial T3; full production-adapter T3 and T4 Redmi remain pending.

## Release sequence

1. Add or change a Skill; bind to declared game/channel/locale/engine ABI.
2. CI tests functional and adversarial fixtures, static schemas and graph constraints.
3. Quarantine if semantic anchors drift or postconditions fail; repair AI outputs proposal only.
4. Explicit approval + real-device acceptance before production activation.
5. Deploy versioned data package to phone; retain last known good and evidence for rollback.
6. Monitor new failure fingerprints; rate-limit and disable *affected* Skill, not unrelated tasks.

## Cost and energy

Sequentially schedule ten games; no continuous 10-game 3D concurrent loop. Energy estimates are **scenario models not Redmi measurements**. M6 must measure task Wh, screenshot/OCR overhead, idle baseline, retry/failed-task overhead and thermal/power throttling before optimizing cloud compute or model choice.

### P0 hardening delta (2026-10-22)

- [x] Review existing hosted CI and candidate CD on `main` (workflow run #35 succeeded, SHA `7ec3c978`).
- [x] Add code-level pre-tap context rechecks and untrusted timestamp rejection with deterministic zero-input regression fixtures in the proposed change.
- [ ] Confirm required CI against this change's exact PR SHA; do not treat a green earlier main build as its result.
- [ ] Add Android host adapter/emulator integration tests and collect redacted real-device evidence before claiming physical behavior is verified.

## Current execution queue (2026-10-26)

1. The preceding main milestone `831d09c1c6884d9ad8b84d2170db95d33ded535a`
   passed Node 20/22, pinned AutoJs6 Rhino and API 30 framework gates. Its
   debug test APK, script, framework receipt and checksums are in the matching
   GitHub Release. This is harness/fixture evidence, not a production capture
   adapter or Redmi/game acceptance.
2. M0 remains open for main-branch ruleset enforcement and a disposable red-PR
   merge-rejection check. The linked GitHub account has repository admin
   permission, but the active connector exposes no branch-rule write action.
   Production MediaProjection, permission lifecycle, OCR and Shizuku input do
   not yet have complete native instrumentation.
3. M1 remains pending physical Redmi acceptance. Complete the eight scenarios
   in [evidence/README.md](../evidence/README.md) on the exact reviewed script.
   Keep live-game input, Skill activation and signed production promotion
   disabled until their own evidence is reviewed.
4. The M2 draft-only schema and validator merged as `d360a2d`; the metadata
   assessor merged as `a6ecb7b`; field-level context diagnostics merged as
   `831d09c`. This continuation adds `validateDraftRegistry` for in-memory draft
   catalogs of up to 32 entries. It rejects invalid entries and duplicate
   game/skill/version identities while permitting distinct versions for review.
   A valid registry is still draft data: no install, load, execute or activate
   path exists. Node, Rhino and API 30 gates cover the contract; passing main
   builds publish the test-only APK.
5. Each accepted development milestone includes a commit-bound APK, script,
   SHA256SUMS and validation scope in GitHub Releases. The APK is temporary
   debug signed; later builds may require reinstalling. It does not complete
   M0/M1 or imply Redmi/game acceptance.

## Real OCR continuation (2026-10-28)

PR #21 adds real emulator screenshot/OCR/input verification around the portable
policy: success, duplicate labels, ineffective input, already-complete, read-only
and delayed frames. All eleven native JUnit identities are required before a
receipt or milestone APK is packaged. This remains a fixture adapter; production
AutoJs6 MediaProjection, permission lifecycle, Shizuku, Redmi and game acceptance
retain their separate gates.

Native attempts exposed ML Kit initialization/Application-context packaging
requirements and CPU OCR exceeding the unchanged 2500 ms freshness budget. The
model is bundled in the debug host, network permissions are removed, and a fullscreen
fixture and bounded model warmup reduce irrelevant work. Native input delivery
plus two result OCR frames exercise full-resolution screenshot coordinates.

Real mixed-confidence duplicates exposed a portable policy defect. Input
uniqueness now considers all matching texts before confidence filtering. The
new regression fails on the preceding implementation; it is shared across Node,
Rhino and the Android script matrix. A targeted mutation restores the unsafe
filter to check regression sensitivity. See PR #21 and issue #5 for exact-commit
hosted results; local results alone do not satisfy the native gate.
