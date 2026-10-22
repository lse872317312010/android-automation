# Game Agent robustness and upgrade resilience — evidence map

Reviewed: 2026-10-22. Assessment scope: **architectural patterns and available public evidence**; NOT a measured or universally comparable game success-rate leaderboard. Research is curated for the independent Android runtime, with Honkai: Star Rail as the first real game test.

## Taxonomy and candidate projects

| Project | Design pattern | Experience / skill persistence | Updates / recovery evidence | Android and limitations |
| --- | --- | --- | --- | --- |
| [MaaFwPhoneAI](https://github.com/plae-tljg/MaaFwPhoneAI) | Android MaaFramework fork + Kotlin SQLite Brain; AI-once and native graph proposals | `pipelines`, `pipeline_versions`, pending `pipeline_fix`, `Test replay`, human Review | Prototypes and documented replay/fix experiments; Android coverage and postcondition breadth incomplete, as documented in `docs/STATUS.md` | Closest product *design*; do not infer robust live multi-game auto-healing is proven |
| [MobiAgent / AgentRR](https://github.com/IPADS-SAI/MobiAgent) | GUI runner + Planner/Grounder + action memory, record/replay | Action tree/chain reuse, experience & profile memory; workflow JSON/benchmark | Research shows repeated-task benefit; not specifically live commercial-game upgrades | Runner often PC/ADB; Android app exists but does not imply full on-device stack |
| [Mobile-Agent-E](https://github.com/X-PLUG/MobileAgent/tree/main/Mobile-Agent-E) | Observe/reason/act/reflect; self-evolving tips/shortcuts | Reusable tips and shortcuts with conditions | Replans after errors in evaluations; no signed game Skill distribution | Research code frequently assumes ADB, external models |
| [Mobile-Agent-v3 / GUI-Owl](https://github.com/X-PLUG/MobileAgent) | GUI grounding, planning, reflection and memory | Planner memory + VLM | Helps adapt unknown UI, but runtime nondeterministic | Good AI proposal engine, not deterministic phone executor |
| [MobileUse / ColorAgent](https://github.com/MadeAgents/mobile-use) | Multimodal mobile GUI agent, hierarchical reflection | Intermediate reasoning and memory | Dynamic Android benchmarks; no production game patch auto-publication evidence | Typically ADB host and model stack |
| [Voyager](https://github.com/MineDojo/Voyager) | Minecraft lifelong learner, executable code skills | Code SkillManager + Chroma/vector retrieval | Automatically learns/refactors behavior inside its research environment | Minecraft environment; not drop-in commercial Android game |
| [Cradle](https://github.com/BAAI-Agents/Cradle) | Multimodal computer-control agent, skill curation/reflection | Executable skill curation | PC game adaptation research; no phone APK lifecycle | Code/project specifics require fresh verification |
| [MaaFramework](https://github.com/MaaXYZ/MaaFramework) | Declarative Pipeline, OCR/template, controllers, custom agents | Pipelines/assets versioned via repo | Strong deterministic recognition/action foundations; most projects maintain UI assets manually | Native Android potential; wrapper/resource runtime must be verified |
| [MaaEnd](https://github.com/MaaEnd/MaaEnd) | Maa + C++ recognition/map/grid + Go policy | Split recognizer, cross-frame GridTracker, Go business, Pipeline actions | Rich recoverable navigation and visual algorithms, actively maintained; not proof AI self-repair | Useful for scene/scroll continuity, complex to port wholesale |
| [BetterGI](https://github.com/babalae/better-genshin-impact) | C# .NET/OpenCV, navigation, tasks, JS | [Scripts list](https://github.com/babalae/bettergi-scripts-list) routes/scripts/strategy subscriptions | Mature human-driven script/resource updating; not automatic LLM repair | Windows-only execution focus |
| [ZenlessZoneZero OneDragon](https://github.com/OneDragon-Anything/ZenlessZoneZero-OneDragon) | Operation graph, interrupt priorities, CV pipeline, Python plugins | Game logic, templates, app plugin factories | Good bounded retries/event control; no verified AI patch gate | Windows-dependent DirectML/input/controller |
| [StarRailCopilot](https://github.com/LmeSzinc/StarRailCopilot) | Alas-derived scheduler, OCR, routes, emulator control | Assets/routes/game task modules | Useful upstream Star Rail task/asset reference, not Android native drop-in | PC + ADB emulator |
| [March7thAssistant](https://github.com/moesnow/March7thAssistant) | Python/OpenCV/RapidOCR, WorkflowRunner YAML | Workflow ZIP templates/OCR asset import/export | Active repo with task, update and release workflows, no verified AI repair | Windows/cloud-game emphasis |
| [Trail CLI](https://github.com/jiwangyihao/trail-cli) | CLI + agent skills + screenshot/OCR/input | Agent-invoked skills | Flexible recovery via external Agent, not deterministic no-token maintenance | Windows, not standalone Android game bot |
| [AutoJs6](https://github.com/SuperMonster003/AutoJs6) | Android JS + UI/CV/OCR + optional Shizuku | JS runtime and plugin center | Not a self-repair engine; convenient low-config local harness | Current M0 host |
| [MaaFwApp](https://github.com/Aliothmoon/MaaFwApp) | Android MaaFramework wrapper, privilege runner/virtual display | Maa project resources generally embedded in APK at build time | No assumption of universal dynamic hot-loading | M2 candidate; not yet integrated |

### Ranking by *what to borrow*, not by star count

1. **MaaFwPhoneAI**: AI-generated *candidate native Pipeline*, verified replay, persistent version history, explicit human promotion gate.
2. **MobiAgent / AgentRR**: cache previous successful state-action trajectories; require matching semantic preconditions, not absolute pixel coordinates.
3. **Mobile-Agent-E**: diagnose failure, reflect on observations and propose local correction; keep AI outside privileged inner loop.
4. **MaaFramework and MaaEnd**: bounded deterministic recognition, independent verifier, structured image assets, multi-frame tracking and diagnostics.
5. **BetterGI and March7thAssistant**: game-specific asset collections, workflows, human-maintained compatibility and update/release practices.
6. **Trail CLI**: optional integration for external agents; not a production safety boundary by itself.

## Why nobody presently meets the entire target

The desired production claim is **game updates → detect affected Skills → AI proposes patch → offline regression → real device proof → trusted release + rollback without manual rewriting**. Individual projects demonstrate subsets. Published AndroidWorld results, self-reported demos or small PC pipelines are not evidence of reliability across *commercial game versions and OEM builds*.

### Distinct failure categories to model

- **Game APK change:** observed `versionCode` / `versionName` differs.
- **Hot update without APK change:** new assets/event/UI while package version remains.
- **Visual anchor drift:** template, color, text, widget moved or duplicated.
- **State graph drift:** old interaction path no longer valid.
- **OCR/model regression:** locale/scale/font/segmentation changes.
- **Execution uncertainty:** Shizuku process restart, background kill, gesture not delivered or unconfirmed.
- **Incorrect verifier:** app state changed but evidence ambiguous; never equate successful input to completion.
- **Input safety:** stale frame, wrong foreground app, rotation/mismatched geometry, duplicate target.
- **Recovery:** crash, timeout, partial completion and potentially non-idempotent action.

### Constraints for imported research

- SRC/Alas Python, BetterGI .NET and OneDragon Windows code are **not** directly Maa native JSON; do not promise automatic cross-language translation.
- A renamed image with identical UI semantics should not prompt an entire workflow rewrite.
- Models and screenshot samples can contain account identifiers, chats and event data; collection and upload must be consented, redacted and bounded.
- Third-party game automation may conflict with game terms and account restrictions; avoid stealth/bypass development.
- Plugin provenance, dependencies, signatures and license compatibility require review before bundling upstream code.

## Application to current repo

Do not replace v0.3's well-scoped read-only test with a per-frame remote LLM. First implement [CI/test quality gates](QUALITY-GATES.md). Second, collect genuine Redmi diagnostic JSON and controlled fixtures. Only then implement manifest/runtime/repair. In the meantime, **the above is research direction, not shipped features**.

See [ADR](ADR-0001-reliable-game-agent.md) and [roadmap](ROADMAP.md).
