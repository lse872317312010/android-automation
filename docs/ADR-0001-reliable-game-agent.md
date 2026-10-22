# ADR-0001 — Deterministic Game Agent + AI-assisted Skill Repair

- Date: 2026-10-22
- Status: **Accepted as a design direction; implementation pending**
- Scope: `android-automation` (independent of Personal OS)
- Priority amendment: **CI/CD and hardware-above test harness MUST precede runtime/plugin development.**
- See [quality gates](QUALITY-GATES.md), [project research](GAME-AGENT-RESEARCH.md), and [roadmap](ROADMAP.md).

## Motivation and current constraints

Goal: one Android/Redmi phone executes daily routines for multiple games sequentially, without a permanently connected PC; AI can diagnose UI changes and propose reusable repairs rather than infer every click. First test game: Honkai: Star Rail. Shizuku is started on the phone, but AutoJs6 authorization and any actual device test are **not proven**.

Implemented in main as of 2026-10-22 (commit `49cd8a3f`): AutoJs6 6.7.0 + Shizuku adapter, MediaProjection/OCR observation, two-frame read-only Star Rail probe, one explicitly user-initiated click experiment with postcondition checking, APK versionCode drift guard, unit tests and GitHub Actions. There is **no game-daily workflow**, MaaFramework native integration, generic hot-update plugin manager, version-repair AI, Redmi validation, or virtual-display acceptance.

## Architectural decision

**Do not make an LLM the inner loop.** Normal execution should use deterministic visual recognition and a constrained workflow; AI is an *offline/asynchronous planning and repair author*, not a privileged command runner.

```text
External Agent / optional Personal OS (user-approved tasks)
                   |
            Capability-gated API
                   |
        Android Automation Runtime
   capture / OCR+CV / act / verify / audit
                   |
   Compatible Skill Resolver + Signature/Version Registry
                   |
       Deterministic Skill State Machine
                   |
  unknown state / drift / bounded error / timeout
                   |
          quarantine affected Skill
                   |
       AI repair candidate generator
                   |
     screenshot regression + simulations
                   |
  device verification + explicit promotion gate
                   |
        signed versioned Skill + rollback
```

### Non-negotiable invariants

1. **Fail closed.** Unknown game scene, ambiguous visual target, low confidence, mismatched package, changed rotation/geometry, stale screenshot, expired authorization, incompatible version, cancellation or timeout must block further input. No blind coordinate fallback or unbounded retry.
2. **Postconditions are independent of the model.** `tap` returning success, a changed screenshot, a positive LLM response, and an `observed` report are not proof of a completed game task. Require a semantically defined verifier, ideally independent signals and multiple observations.
3. **Repair one smallest affected Skill.** Separate game-specific scenes, icons, ROI, OCR and state transitions into independently versioned Skill assets; shared recognizers are dependencies whose consumers require regression testing.
4. **AI proposes; policy/test gates promote.** LLM/VLM may suggest corrected templates, thresholds, semantic locators or constrained workflow graphs with rationale and evidence. It may not inject privileged input or silently deploy executable code.
5. **Local-first and minimal authority.** Android screenshot/OCR/gesture/permission stays on phone. Game plugins cannot directly acquire Shizuku privileges. Cloud AI receives minimum redacted evidence and never full screen or personal records by default. No secrets or account identifiers in CI fixtures.
6. **No fabricated hardware success.** Node tests prove policy logic only. Emulator and physical phone are separate acceptance tiers; actual Shizuku, MediaProjection, model/OCR and Star Rail UI require device evidence.
7. **External interface stays optional.** Personal OS owns structured personal data, plans and approved strategy history; android-automation owns capabilities, execution and evidence. `android-automation.run.v1` is experimental; not a deployed Personal OS ingestion contract.
8. **Safe release.** Signed/read-only data packages may support controlled hot replacement and rollback; arbitrary JS/Python/C++ binaries are different trust classes and need source review, permissions, provenance and binary verification.
9. **Game compliance.** Respect operator terms. Do not add anti-cheat evasion, game client injection or bypass mechanisms.

### Runtime taxonomy

- Capture/Perception/Action/Verify/Evidence: common device interface; start with AutoJs6+Shizuku. Consider MaaFramework Native / MaaFwApp only after device tests.
- Skill Runtime: versioned declarative JSON/YAML/pipeline with bounded graph edges, retry budgets, capabilities and semantic postconditions.
- Compatibility Registry: checks game package + APK version **and** UI/resource fingerprint, locale, device, task and Skill revision. APK code alone cannot detect hot patches.
- Memory: optional AgentRR-like successful state/action traces, indexed by semantic preconditions, not blind coordinate replay.
- AI Repair: Mobile-Agent-E-style reflection + MaaFwPhoneAI-like graph proposals, never production execution without separate validation.
- Upstream watcher: StarRailCopilot, March7thAssistant and other maintained task assets are *references*, not directly executable phone plugins; source-code changes must be adapted and verified.
- Release: guarded candidate → offline regression → device acceptance → optional approval → active; rollback on detected regressions.

## Compatibility and repair lifecycle

1. Detect client package/version change, changed visual anchor or postcondition failure; classify it and quarantine the minimum impacted Skill.
2. Gather sanitized evidence subject to explicit consent and retention policy. Keep a local failure fingerprint, previous verified Skill version, and reproducible test reference.
3. Locate likely broken component (scene anchor, locator, branch, timeout, output verifier); AI proposes a minimal patch with explicit assumptions.
4. Replay across historical **and** changed visual fixtures; test mismatched packages, wrong resolution/orientation, duplicate OCR, prior completed state, canceled run, failed injection and stale frames. Require zero unsafe taps in negative cases.
5. Validate on a test Android device; do not treat emulator or an LLM-generated screenshot as physical Redmi validation.
6. Promote only after objective postconditions and human/defined approval gate. Store immutable signed version + rollback pointer.
7. Observe field failures; if reliability drops, disable that Skill and revert, not all other games.

## Definition of reliability

Use levels:
- L1: coordinate macro.
- L2: vision + bounded deterministic state machine.
- L3: AI reflection after failure.
- L4: validated reusable Skill, replay and repair proposals.
- L5: version/drift detection, impact analysis, regression, verified controlled publication and rollback.

**Current project is at an experimental subset of L2; L3–L5 are plans, not delivered claims.**

Suggested product SLOs, **targets not measured results**:
- Zero known P0/P1 defects accepted into a release.
- 100% pass rate of mandatory CI checks and all negative safety regression scenarios.
- Zero unsafe actions in test scenarios and zero false completion labels in fixtures.
- Per-Skill end-to-end success target >=98% on a defined device/game/version sample, with Wilson confidence intervals reported; target is provisional.
- Existing game updates or screen changes trigger targeted revalidation; no claim of 100% detection of unknown hot patches.
- Successful stable routines should ordinarily use zero AI calls (target >=90% deterministic successful runs, measured later).

## Rejected alternatives

- A per-click VLM agent: high cost/latency, nondeterminism, difficult reproduction, risks elevated device permissions.
- Port all StarRailCopilot Python into Android immediately: Python/Alas desktop and emulator assumptions, harder validation and upgrade coupling.
- Make MaaFramework-specific Pipeline the only truth: creates vendor lock-in and ties Personal OS data to an execution backend.
- Auto-approve repairs when a model says success: creates false positives and possible irreversible user actions.
- Promise absolute `0 bug`: formal proof and complete hardware/environment coverage are unavailable. Instead define measurable quality gates, coverage and a documented residual-risk boundary.

## Milestone ordering decision

**M0 (NOW): build/test/release infrastructure + deterministic fault-injection simulator + versioned fixture datasets; CI must be green before code merges.**
M1: Redmi evidence for capture→OCR→one explicit action→semantic verification, with safe stop and failure injection.
M2: manifest, compatibility/Skill Registry, data-first hot-swappable resource bundles, rollback and protocol.
M3: AI repair proposal/experience memory + isolated regression, zero-token stable replay.
M4: upstream change ingestion, device validation farm, controlled release and monitoring.

For exact gates, deliverables, status boundaries and ownership: see [QUALITY-GATES.md](QUALITY-GATES.md) and [ROADMAP.md](ROADMAP.md).
