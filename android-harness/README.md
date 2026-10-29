# Android framework-contract harness

This is a test-only APK plus instrumentation APK, with a milestone launcher for manual fixture access and script export.
It has no privileged input or network permission. It is not the planned automation product APK.

The GitHub workflow builds with Gradle 8.9, AGP 8.7.3, JDK 17 and compile SDK 35,
then runs instrumentation on an API 30 x86_64 emulator. Dependency and emulator
startup failures fail the job; no green skip is configured. CI retains native
JUnit/instrumentation reports when they are produced.

Tests:

1. Run 32 shared script scenarios on Android's ART runtime using the pinned
   AutoJs6 Rhino jar. Thirty-one exercise the inert host adapter with real Android
   Rect fields and Bitmap dimension methods; UI, permission, capture source,
   OCR, foreground and Shizuku remain substitutions. One validates the draft
   Skill contract and metadata-only compatibility assessor, including stable
   malformed-context codes; even a full metadata match keeps activation false
   and requests no device I/O. These are not end-to-end AutoJs6 tests.
2. Check real Bitmap copy/recycle ownership with Android framework objects.
3. Check actual app-private File.renameTo replacement/failure preservation.
4. Open an unexported native fixture Activity, capture its actual emulator pixels,
   inject one DOWN/UP gesture with Instrumentation, verify the unique PASS token
   in the native view and the changed panel color in two screenshots.
5. Close the fixture and confirm the fixture input helper refuses a gesture.
6. Six additional OCR-loop tests execute the actual `src/core.js` policy in
   pinned Rhino: success, duplicate targets, ineffective input, already complete
   read-only and intentionally delayed frames. A dedicated unexported Activity renders a fresh six-digit
   token. UiAutomation captures real emulator pixels; bundled ML Kit Chinese
   `16.0.1` recognizes text/boxes/confidence; Instrumentation sends a single
   DOWN/UP gesture at the OCR-derived location. Success requires two subsequent
   OCR frames matching the exact PASS token. The native click counter separately
   checks delivery. No view location/text is supplied to the policy.
   ML Kit belongs to the debug host APK so Android initializes its provider and
   model using a real Application context. The debug manifest removes Internet
   and network-state permissions; the native OCR tests assert Internet permission
   is denied. The model is bundled; no Play-services model download is required.
   The Nexus S profile uses a 480x800 display to reduce CPU OCR cost while
   retaining the 2500 ms freshness gate. The delayed-frame case must fail with
   `STALE_FRAME` and zero input. Aggregate logs contain dimensions, elapsed time
   and line count; no screenshot files or OCR text are exported.

This is a partial T3 framework contract, not T3 capture/permission acceptance,
T4 physical Redmi acceptance, OCR accuracy or actual game validation. Do not
mark it complete until the exact commit builds and instrumented tests pass.

To reproduce with an installed Android SDK, Java 17, Gradle 8.9 and emulator:

```sh
node tool/test-rhino.mjs
mkdir -p android-harness/app/libs
cp .cache/rhino/autojs6-rhino.jar android-harness/app/libs/autojs6-rhino.jar
gradle -p android-harness :app:assembleDebug :app:assembleDebugAndroidTest
gradle -p android-harness :app:connectedDebugAndroidTest
```

The dependency is downloaded from the pinned AutoJs6 upstream commit and both
hashes are checked by `tool/test-rhino.mjs`. It is not checked into this repository.
Native output is synthetic test evidence. After successful emulator tests, the debug app APK, bundled script, checksums
and scoped receipt are uploaded as a 30-day milestone artifact by
this workflow; source provenance is in `test/runtime/rhino-lock.json`.

The workflow also requires the exact eleven native JUnit testcase identities,
with no missing, duplicate, skipped, failed or unexpected cases. A separate
Python standard-library validator has negative report fixtures in the ordinary
CI suite. On success, `test-results/android-framework.json` records the checkout
commit, script SHA-256, API level and partial-T3 scope; it is a CI-generated
receipt, not hardware attestation. Failed validation removes an older receipt.

The native UI tests use a dedicated Activity with no launcher or exported entry.
Only instrumentation starts it. Screenshots stay in memory and are recycled;
no screenshot files, OCR text or input permissions are added to the app manifest.
The existing 32 bundled-script scenarios still use inert capture/OCR/input; the Skill metadata assessor, field-level context diagnostics and two-entry draft registry use fixture values and always report zero taps.
The new UI tests use Android Instrumentation and UiAutomation directly; they
do not execute the production JavaScript adapter. The original pixel-color tests
read the PASS token from the native view; the six OCR-loop tests recognize it
from screenshots instead. Focus checks are best-effort, not atomic
with Android input dispatch. Run only on the dedicated disposable CI emulator.

## Milestone APK delivery

Each successful relevant PR/main build now uploads `AndroidAutomation-milestone-<checkout SHA>`.
Unzip the artifact and install `AndroidAutomation-milestone.apk`. The launcher opens
a manual fixture or exports the bundled script through Android's document picker;
use AutoJs6 to execute that script. Manual PASS is not automated acceptance.
The instrumentation APK is not delivered to phone users. Debug signing is temporary
and does not establish an upgrade identity; replacing a differently signed build
may require uninstall/reinstall. This is not the signed production automation host.

On pushes to `main`, after the native emulator job succeeds, CI publishes these
same files as a prerelease in GitHub Releases tagged `milestone-<full commit SHA>`.
PR builds still retain short-lived Actions artifacts for review; the user-facing
installation link is the published GitHub Release. Each milestone is immutable
and includes `SHA256SUMS`. It remains a debug-signed prerelease, not stable-signed.

### Milestone byte and signature gates

The framework job runs Android SDK `apksigner verify` before instrumentation.
`tool/verify-milestone.py` checks the exact six-file inventory, SHA256SUMS,
external checkout commit, native receipt scope/count and source script hash.
It also reads the actual APK ZIP and requires its embedded exported script to
match the standalone script. Duplicate ZIP entries are rejected.

The release job validates the downloaded Actions artifact, uploads a draft,
downloads its actual assets and compares them with the preupload checksum
manifest before publishing. Interrupted drafts can resume; published assets are
verified without replacement. A failed readback leaves a new release in draft.
The publisher's ordering/failure tests use a fake GitHub CLI and the real byte
validator; live GitHub publication is verified separately by main CI.

Developer reproduction (Python 3.11+, matching source checkout):

```sh
python3 tool/verify-milestone.py --directory downloaded-milestone \
  --commit <full-checkout-sha> --source-bundle dist/AndroidAutomation.js
```

This verifies package consistency. Signature validity is a separate SDK gate;
neither establishes a stable production signing identity or hardware acceptance.

## OCR performance and ambiguity regression

The OCR fixture is fullscreen and contains only task text. The full-resolution screenshot
is recognized without coordinate scaling. Native click delivery and two OCR
result frames exercise the OCR-derived pixel location. All capture and recognition
time counts against the original 2500 ms freshness limit; timestamps are not reset.
The token uses the same nonzero-leading six-digit format as the AutoJs6 fixture.

Real OCR exposed mixed-confidence duplicate labels. The portable input policy
now rejects multiple matching texts before filtering confidence; a weak or
malformed-confidence duplicate cannot establish uniqueness. The regression fails
on the preceding implementation and runs in Node and the shared Rhino matrix.
One additional targeted mutation deliberately restores the unsafe filter.

The CI AVD has four virtual CPU cores and 2048 MB RAM. Each scenario performs
three bounded, input-free OCR warmup captures before starting the policy
transaction. Once policy starts, real elapsed capture/OCR time counts against
the unchanged freshness/deadline checks; the deliberately delayed policy frame
still must block with zero input. This does not establish Redmi performance.
