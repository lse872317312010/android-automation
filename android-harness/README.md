# Android framework-contract harness

This is a test-only APK plus instrumentation APK, with a milestone launcher for manual fixture access and script export.
It has no privileged input or network permission. It is not the planned automation product APK.

The GitHub workflow builds with Gradle 8.9, AGP 8.7.3, JDK 17 and compile SDK 35,
then runs instrumentation on an API 30 x86_64 emulator. Dependency and emulator
startup failures fail the job; no green skip is configured. CI retains native
JUnit/instrumentation reports when they are produced.

Tests:

1. Run all 28 shared host scenarios on Android's ART runtime using the pinned
   AutoJs6 Rhino jar. The adapter reads real Android Rect fields and Bitmap
   dimension methods. UI, permission, capture source, OCR, foreground and
   Shizuku remain inert substitutions. This does not take the emulator screen
   or send a gesture, and is not an end-to-end AutoJs6 test.
2. Check real Bitmap copy/recycle ownership with Android framework objects.
3. Check actual app-private File.renameTo replacement/failure preservation.
4. Open an unexported native fixture Activity, capture its actual emulator pixels,
   inject one DOWN/UP gesture with Instrumentation, verify the unique PASS token
   in the native view and the changed panel color in two screenshots.
5. Close the fixture and confirm the fixture input helper refuses a gesture.

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

The workflow also requires the exact five native JUnit testcase identities,
with no missing, duplicate, skipped, failed or unexpected cases. A separate
Python standard-library validator has negative report fixtures in the ordinary
CI suite. On success, `test-results/android-framework.json` records the checkout
commit, script SHA-256, API level and partial-T3 scope; it is a CI-generated
receipt, not hardware attestation. Failed validation removes an older receipt.

The native UI tests use a dedicated Activity with no launcher or exported entry.
Only instrumentation starts it. Screenshots stay in memory and are recycled;
no screenshot files, OCR text or input permissions are added to the app manifest.
The existing 28 bundled-script scenarios still use inert capture/OCR/input.
The new UI tests use Android Instrumentation and UiAutomation directly; they
do not execute the production JavaScript adapter. The PASS token is read from
the native view, not recognized by OCR. Focus checks are best-effort, not atomic
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
