# Android game automation roadmap — quality gates first

Updated 2026-10-22. Execution repo intentionally separate from Personal OS.
Source of truth: [ADR-0001](ADR-0001-reliable-game-agent.md) · [Quality](QUALITY-GATES.md) · [Research](GAME-AGENT-RESEARCH.md).

## Priority and status

| Phase | Priority | Engineering goal | Exit evidence | Status |
| --- | --- | --- | --- | --- |
| **M0: CI/CD & test harness** | **P0: do first** | Node LTS test matrix, deterministic mocked device and seeded fault injection; coverage/syntax/generator consistency gates; release candidate checksum; test/evidence convention | Green mandatory GitHub Actions on exact merge SHA; reproducible artifact and checksum; no unknown unsafe tap in negative scenarios | **In progress** |
| **M1: native Redmi smoke acceptance** | P0 after M0 | AutoJs6 6.7.0 + Shizuku permission, capture, OCR, one user-approved action, verification, safe stop, recover interrupted | Redacted report from physical Redmi and user-observed test, separate from offline CI | Not done |
| **M2: Skill Runtime / isolation** | P1 | Data-first Skill manifest, JSON schema, parser, capability-gated executor, compatibility registry, screenshots/visual signature, scoped error and rollback | Install two fixture Skills; reject unsigned/malformed/incompatible; safe rollback, no cross-game impact | Design only |
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
- [ ] Add Android emulator app-contract test when Android runtime exists
- [ ] Validate hardware permissions and actual game input on Redmi (M1, never simulated by CI)

Checklist intentionally records a plan; completion of a doc file alone does not mark code/tests complete. Update statuses based on merged CI and physical evidence.

## Planned interfaces (not in source yet)

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

Version registry, repair API and Personal OS integration are separate deliverables; none exist in the v0.3 script.

### Current continuation (2026-10-22)

- Added five regressions which fail on baseline `8821210`: report persistence can
  expire OCR data or allow focus, rotation or cancellation to change just before
  the adapter submits input. Recheck after the final write and reject stale data.
- Added seven acceptance-record validator tests. Local suite now has 49 tests;
  CI evidence for this change must be recorded on its exact PR head.
- CI retains synthetic/offline JUnit output for Node 20 and 22. These artifacts
  describe T0/T1, not Android or physical-device results.
- No Android SDK, adb or emulator was present in the development container at
  inspection time. T3/T4 remain blocked, and no independent APK was built.
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
  These remain T0/T1 evidence. T3 Android and T4 Redmi are still pending.

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
