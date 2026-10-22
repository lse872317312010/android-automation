# Hardware-free runtime regression

The same 28 inert host scenarios execute the committed distribution in Node VM
and in the exact Rhino jar bundled by AutoJs6 6.7.0. The 10 earlier host tests
reuse this fixture too, rather than maintaining a second API simulation.

## Commands

```sh
node build.mjs
node --test test/*.test.cjs
node tool/test-rhino.mjs
node tool/mutation-check.mjs
```

Node tests need no third-party dependency or network. The first Rhino run needs
Java 17 and curl; it downloads the pinned upstream jar to ignored `.cache/rhino`.
Every run verifies both SHA-256 and Git blob digest, including when using cache.
Downloads/hash failures and subprocess timeouts fail the job, rather than skipping
an unavailable runtime. The repo does not redistribute the jar.

Runtime lock: `test/runtime/rhino-lock.json`. Source is AutoJs6 tag v6.7.0,
commit `e72ff562f68094f9fa63eae4b4c06ec5303d670f`,
`libs/org-mozilla-rhino-2_0_0-SNAPSHOT.jar`. Its Git blob is
`0561229643ce2873ebecf83adba01a5f81698a19`; SHA-256 is
`4b92486727763999d98119070c0455e68e25d3af05fe06d6202e71b90b419938`.
AutoJs6's `app/build.gradle.kts` includes this file, and
`org/autojs/autojs/rhino/AndroidContextFactory.kt` selects ES6. The desktop
runner uses Rhino language version 200 in interpreted mode. It does not replace
or instantiate AutoJs6's Android-specific ContextFactory, bridges or UI inflater.

## Current scenarios

- Full fixture verification and read-only observation.
- Permission refusal, wrong app, APK drift and missing/corrupt version baseline.
- Focus, rotation, cancellation, stale OCR and deadline changes at final write.
- Uncertain/ignored input, zero retries, duplicate start and queued stop.
- Screenshot/OCR exceptions; private uppercase/string/null exception handling.
- Evidence write/rename failures, final-write failure and cold restart.
- Copied image reclamation, retaining the capture API's cached image, capture stop.
- Version baseline replacement failure retains the old file.

The shared fixture advances a deterministic clock, maintains in-memory files,
and only records privileged-command strings. Every scenario uses a fresh scope;
no screenshot, OCR engine, gesture, network or Android service is actually called.
The engine run therefore adds real Rhino execution to **T0/T1**, not T3 emulator
or T4 physical-device acceptance. It does not cover Android Java interop or actual
thread scheduling, even though it can simulate selected interleavings.

## Bugs found before hardware

The expanded cases reproduced on the PR #6 baseline:

1. Uppercase native exception messages could pass a regex and escape into the
   diagnostic report. Export only explicitly recognized codes; null and unknown
   platform errors become RUNTIME_ERROR.
2. A failed version-baseline rename could lose the previous valid file because
   the host deleted it first. Replace via same-directory rename without explicit
   deletion. The stub tests failure preservation; Android filesystem behavior
   still needs Android-level acceptance.

## Test sensitivity

Ten deliberate source changes are applied only in isolated ignored copies:
raw-error export, delete-before-replace, image leak, cached-image recycling,
missing APK input gate, read-only input capability, one-frame completion,
duplicate input, stale frame after stage persistence and removed final focus
check. Each mutant must parse, build, then fail a real test assertion. A timeout,
missing module or syntax error is a harness error, not a detected regression.
All 10 are detected locally. This is targeted sensitivity, **not an exhaustive
mutation score or proof of zero defects**.

CI and tagged candidate CD run the checks on the exact checkout. CI retains
synthetic JUnit, Rhino results (including engine and script hashes), and mutation
results for 14 days. Branch protection still needs the additional required check
`AutoJs6 6.7.0 Rhino / inert host` configured and verified separately.
