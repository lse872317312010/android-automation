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

/** Native framework contracts only. No Shizuku, screen capture, model or input. */
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
        JSONArray cases = new JSONArray(asset("cases.json"));
        assertEquals(28, cases.length());
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
    private void write(File file, String value) throws Exception {
        try (FileOutputStream stream = new FileOutputStream(file)) {
            stream.write(value.getBytes(StandardCharsets.UTF_8));
        }
    }
}
