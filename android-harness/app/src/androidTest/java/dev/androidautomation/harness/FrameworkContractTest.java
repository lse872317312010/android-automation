package dev.androidautomation.harness;

import static org.junit.Assert.*;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Rect;
import android.util.Log;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mozilla.javascript.Scriptable;
import org.mozilla.javascript.ScriptableObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/** Framework and inert native UI contracts; no production adapter, OCR or Shizuku. */
@RunWith(AndroidJUnit4.class)
public class FrameworkContractTest {
    private final Context instrumentationContext = InstrumentationRegistry.getInstrumentation().getContext();
    private String asset(String name) throws Exception {
        try (var in = instrumentationContext.getAssets().open(name)) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int count;
            while ((count = in.read(buffer)) != -1) bytes.write(buffer, 0, count);
            return new String(bytes.toByteArray(), StandardCharsets.UTF_8);
        }
    }
    @Test public void shippedBundleWithAndroidValues() throws Exception {
        try (var in = InstrumentationRegistry.getInstrumentation().getTargetContext().getAssets().open("AndroidAutomation.js")) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int count;
            while ((count = in.read(buffer)) != -1) bytes.write(buffer, 0, count);
            assertEquals("Exported script must match tested bundle", asset("AndroidAutomation.js"),
                new String(bytes.toByteArray(), StandardCharsets.UTF_8));
        }
        JSONArray cases = new JSONArray(asset("cases.json"));
        assertEquals(29, cases.length());
        for (int i = 0; i < cases.length(); i++) {
            JSONObject scenario = cases.getJSONObject(i);
            org.mozilla.javascript.Context cx = org.mozilla.javascript.Context.enter();
            Bitmap bitmap = Bitmap.createBitmap(1080, 2400, Bitmap.Config.ARGB_8888);
            try {
                cx.setLanguageVersion(org.mozilla.javascript.Context.VERSION_ES6);
                cx.setOptimizationLevel(-1); // Android cannot use JVM bytecode class generation.
                Scriptable scope = cx.initStandardObjects();
                cx.evaluateString(scope, "var __preload=Packages.java.lang.String; var __options=" +
                    scenario.getJSONObject("options") + ";", "options", 1, null);
                cx.evaluateString(scope, asset("host-fixture.js"), "host-fixture.js", 1, null);
                ScriptableObject.putProperty(scope, "__nativeRect", org.mozilla.javascript.Context.javaToJS(new Rect(100, 200, 400, 300), scope));
                ScriptableObject.putProperty(scope, "__nativeBitmap", org.mozilla.javascript.Context.javaToJS(bitmap, scope));
                // Preserve exception/permission injection while exercising Android
                // public Rect fields and Bitmap methods through real Rhino interop.
                cx.evaluateString(scope,
                    "var __oldOcr=ocr.mlkit.detect; ocr.mlkit.detect=function(img){" +
                    "var rows=__oldOcr(img); for(var i=0;i<rows.length;i++) rows[i].bounds=__nativeRect; return rows;};" +
                    "var __oldCapture=images.captureScreen; images.captureScreen=function(){" +
                    "var image=__oldCapture(); image.getWidth=function(){return __nativeBitmap.getWidth();};" +
                    "image.getHeight=function(){return __nativeBitmap.getHeight();}; return image;};",
                    "android-value-bindings", 1, null);
                cx.evaluateString(scope, asset("AndroidAutomation.js"), "AndroidAutomation.js", 1, null);
                cx.evaluateString(scope, asset("case-runner.js"), "case-runner.js", 1, null);
                Object result = cx.evaluateString(scope, "JSON.stringify(runRuntimeCase(" + scenario + "))", "case", 1, null);
                assertEquals("pass", new JSONObject(org.mozilla.javascript.Context.toString(result)).getString("status"));
                Log.i("AutomationContract", "PASS " + scenario.getString("name"));
            } catch (Throwable error) {
                throw new AssertionError("Framework case failed: " + scenario.getString("name"), error);
            } finally {
                bitmap.recycle();
                org.mozilla.javascript.Context.exit();
            }
        }
    }
    @Test public void ownedBitmapCopyCanBeRecycledWithoutInvalidatingSource() {
        Bitmap original = Bitmap.createBitmap(64, 64, Bitmap.Config.ARGB_8888);
        Bitmap copy = original.copy(Bitmap.Config.ARGB_8888, false);
        try {
            assertNotSame(original, copy);
            copy.recycle();
            assertFalse(original.isRecycled());
            assertEquals(64, original.getWidth());
        } finally {
            if (!copy.isRecycled()) copy.recycle();
            original.recycle();
        }
    }
    @Test public void privateDirectoryRenameRetainsBaselineOnFailure() throws Exception {
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File dir = Files.createTempDirectory(app.getCacheDir().toPath(), "rename-contract-").toFile();
        File baseline = new File(dir, "baseline.json"), pending = new File(dir, "pending.json");
        try {
            write(baseline, "old");
            assertFalse(pending.renameTo(baseline));
            assertEquals("old", new String(Files.readAllBytes(baseline.toPath()), StandardCharsets.UTF_8));
            write(pending, "new");
            assertTrue(pending.renameTo(baseline));
            assertEquals("new", new String(Files.readAllBytes(baseline.toPath()), StandardCharsets.UTF_8));
        } finally {
            pending.delete(); baseline.delete(); dir.delete();
        }
    }

    @Test public void fixtureScreenshotAndSingleInjectedTap() throws Exception {
        var instrumentation = InstrumentationRegistry.getInstrumentation();
        FixtureActivity fixture = launchFixture();
        try {
            assertFixtureFrame(fixture, FixtureActivity.BEFORE);
            assertTrue("Fixture lost focus before injection", tapFixture(fixture));
            instrumentation.waitForIdleSync();
            instrumentation.runOnMainSync(() -> {
                assertEquals(1, fixture.tapCount);
                assertEquals("PASS " + fixture.token, fixture.outcome.getText().toString());
            });
            // Two independent screenshots after the action; no images are persisted.
            assertFixtureFrame(fixture, FixtureActivity.AFTER);
            assertFixtureFrame(fixture, FixtureActivity.AFTER);
        } finally {
            instrumentation.runOnMainSync(fixture::finish);
            instrumentation.waitForIdleSync();
        }
    }

    @Test public void closedFixtureRejectsInput() throws Exception {
        var instrumentation = InstrumentationRegistry.getInstrumentation();
        FixtureActivity fixture = launchFixture();
        instrumentation.runOnMainSync(fixture::finish);
        instrumentation.waitForIdleSync();
        assertFalse("Closed fixture must not receive input", tapFixture(fixture));
        assertEquals(0, fixture.tapCount);
    }

    private FixtureActivity launchFixture() {
        var instrumentation = InstrumentationRegistry.getInstrumentation();
        Context app = instrumentation.getTargetContext();
        android.content.Intent intent = new android.content.Intent(app, FixtureActivity.class);
        intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
        FixtureActivity fixture = (FixtureActivity) instrumentation.startActivitySync(intent);
        instrumentation.waitForIdleSync();
        // Wait for native window focus, not an arbitrary fixed startup delay.
        long deadline = android.os.SystemClock.uptimeMillis() + 5000;
        boolean[] focused = {false};
        do {
            instrumentation.runOnMainSync(() -> focused[0] = fixture.hasWindowFocus());
            if (focused[0]) return fixture;
            android.os.SystemClock.sleep(50);
        } while (android.os.SystemClock.uptimeMillis() < deadline);
        instrumentation.runOnMainSync(fixture::finish);
        throw new AssertionError("Fixture did not acquire focus");
    }

    private boolean tapFixture(FixtureActivity fixture) {
        var instrumentation = InstrumentationRegistry.getInstrumentation();
        float[] point = new float[2];
        boolean[] allowed = {false};
        instrumentation.runOnMainSync(() -> {
            if (fixture.isFinishing() || fixture.isDestroyed() || !fixture.hasWindowFocus()) return;
            assertEquals(instrumentation.getTargetContext().getPackageName(), fixture.getPackageName());
            int[] location = new int[2];
            fixture.target.getLocationOnScreen(location);
            assertTrue(fixture.target.getWidth() > 0 && fixture.target.getHeight() > 0);
            point[0] = location[0] + fixture.target.getWidth() / 2f;
            point[1] = location[1] + fixture.target.getHeight() / 2f;
            allowed[0] = true;
        });
        if (!allowed[0]) return false;
        long time = android.os.SystemClock.uptimeMillis();
        android.view.MotionEvent down = android.view.MotionEvent.obtain(
            time, time, android.view.MotionEvent.ACTION_DOWN, point[0], point[1], 0);
        android.view.MotionEvent up = android.view.MotionEvent.obtain(
            time, time + 20, android.view.MotionEvent.ACTION_UP, point[0], point[1], 0);
        try {
            // Native emulator input only; no shell command or production adapter.
            instrumentation.sendPointerSync(down);
            instrumentation.sendPointerSync(up);
        } finally {
            down.recycle();
            up.recycle();
        }
        return true;
    }

    private void assertFixtureFrame(FixtureActivity fixture, int expectedColor) {
        var instrumentation = InstrumentationRegistry.getInstrumentation();
        int[] sample = new int[2];
        instrumentation.runOnMainSync(() -> {
            assertTrue("Fixture must own the focused window", fixture.hasWindowFocus());
            fixture.panel.getLocationOnScreen(sample);
            sample[0] += 8;
            sample[1] += 8;
        });
        long deadline = android.os.SystemClock.uptimeMillis() + 5000;
        do {
            Bitmap frame = instrumentation.getUiAutomation().takeScreenshot();
            assertNotNull("Native screenshot unavailable", frame);
            try {
                assertTrue(sample[0] >= 0 && sample[0] < frame.getWidth());
                assertTrue(sample[1] >= 0 && sample[1] < frame.getHeight());
                if (frame.getPixel(sample[0], sample[1]) == expectedColor) return;
            } finally {
                frame.recycle();
            }
            android.os.SystemClock.sleep(100);
        } while (android.os.SystemClock.uptimeMillis() < deadline);
        fail("Expected fixture pixels not observed before deadline");
    }

    private void write(File file, String value) throws Exception {
        try (FileOutputStream stream = new FileOutputStream(file)) {
            stream.write(value.getBytes(StandardCharsets.UTF_8));
        }
    }
}
