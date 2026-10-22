# Android framework-contract harness

This is a test-only APK plus instrumentation APK, with no launcher, user-data
access or input permission. It is not the planned automation product APK.

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
Native output is synthetic test evidence. APKs are not uploaded or released by
this workflow; source provenance is in `test/runtime/rhino-lock.json`.
