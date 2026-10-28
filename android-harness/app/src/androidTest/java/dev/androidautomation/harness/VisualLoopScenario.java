package dev.androidautomation.harness;

import static org.junit.Assert.*;
import android.app.Instrumentation;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Rect;
import android.os.SystemClock;
import android.view.MotionEvent;
import androidx.test.platform.app.InstrumentationRegistry;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.Scriptable;
import org.mozilla.javascript.ScriptableObject;

/** Production portable policy, with real emulator pixels/OCR/input. No AutoJs/Shizuku. */
public class VisualLoopScenario {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private String asset(String name) throws Exception {
        try (var stream = instrumentation.getContext().getAssets().open(name)) {
            var bytes = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int count;
            while ((count = stream.read(buffer)) != -1) bytes.write(buffer, 0, count);
            return new String(bytes.toByteArray(), StandardCharsets.UTF_8);
        }
    }
    public void run(String mode, String expected, int taps) throws Exception {
        // Fresh token per scenario; OCR must recover it from pixels, not view text.
        String token = String.format(Locale.ROOT, "%06d", SystemClock.uptimeMillis() % 1000000);
        var app = instrumentation.getTargetContext();
        assertEquals("Bundled fixture OCR must have no Internet permission",
            android.content.pm.PackageManager.PERMISSION_DENIED,
            app.checkSelfPermission(android.Manifest.permission.INTERNET));
        Intent intent = new Intent(app, VisualFixtureActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).putExtra("mode", mode).putExtra("token", token);
        VisualFixtureActivity fixture = (VisualFixtureActivity) instrumentation.startActivitySync(intent);
        TextRecognizer recognizer = null;
        Context cx = null;
        try {
            recognizer = TextRecognition.getClient(new ChineseTextRecognizerOptions.Builder().build());
            long deadline = SystemClock.uptimeMillis() + 5000;
            Device device = new Device(fixture, recognizer, mode);
            while (!device.focused() && SystemClock.uptimeMillis() < deadline) SystemClock.sleep(50);
            assertTrue("OCR fixture did not acquire focus", device.focused());
            // Warm the bundled model before the policy's frame-age/deadline budget.
            device.observe();
            cx = Context.enter();
            cx.setLanguageVersion(Context.VERSION_ES6);
            cx.setOptimizationLevel(-1);
            Scriptable scope = cx.initStandardObjects();
            ScriptableObject.putProperty(scope, "device", Context.javaToJS(device, scope));
            cx.evaluateString(scope, asset("core.js"), "core.js", 1, null);
            String spec = new JSONObject().put("packageName", app.getPackageName())
                .put("target", "TEST " + token).put("expected", new JSONArray().put("PASS " + token))
                .put("minExpected", 1).put("confidence", 0.65).put("timeoutMs", 45000)
                .put("expectedExact", true).toString();
            String script = "var io={now:function(){return Number(device.now());}," +
                "sleep:function(ms){device.pause(ms);},cancelled:function(){return false;}," +
                "foreground:function(){return String(device.foreground());}," +
                "observe:function(){return JSON.parse(String(device.observe()));}," +
                "checkGeometry:function(f){device.checkGeometry(f.width,f.height,f.rotation);}," +
                "stage:function(s){},tap:function(x,y){device.tap(x,y);}};" +
                "var result;try{result=VisualLoop." + ("readonly".equals(mode) ? "probe" : "run") +
                "(io," + spec + ").status;}catch(e){result=String(e.message);};result;";
            String result = Context.toString(cx.evaluateString(scope, script, "visual-loop", 1, null));
            assertEquals("mode=" + mode + " frames=" + device.frames + " lastFrameMs=" + device.lastFrameMs +
                " captureMs=" + device.lastCaptureMs + " ocrMs=" + device.lastOcrMs +
                " geometry=" + device.lastWidth + "x" + device.lastHeight + " lines=" + device.lastLines,
                expected, result);
            assertEquals(taps, device.requests);
            instrumentation.waitForIdleSync();
            // Independent delivery counter; success still requires policy OCR verification.
            instrumentation.runOnMainSync(() -> assertEquals(taps, fixture.deliveredTaps));
            assertTrue("No real screenshot was recognized", device.frames >= 2);
        } finally {
            if (cx != null) Context.exit();
            if (recognizer != null) recognizer.close();
            instrumentation.runOnMainSync(fixture::finish);
            instrumentation.waitForIdleSync();
        }
    }

    public class Device {
        private final VisualFixtureActivity fixture;
        private final TextRecognizer recognizer;
        private final String mode;
        int requests, frames;
        long lastFrameMs, lastCaptureMs, lastOcrMs;
        int lastWidth, lastHeight, lastLines;
        Device(VisualFixtureActivity fixture, TextRecognizer recognizer, String mode) {
            this.fixture = fixture; this.recognizer = recognizer; this.mode = mode;
        }
        public long now() { return SystemClock.uptimeMillis(); }
        public void pause(long ms) { SystemClock.sleep(ms); }
        public boolean focused() {
            boolean[] value = {false};
            instrumentation.runOnMainSync(() -> value[0] = !fixture.isFinishing() &&
                !fixture.isDestroyed() && fixture.hasWindowFocus());
            return value[0];
        }
        public String foreground() {
            // Platform focus belongs to this specific fixture Activity.
            // Avoid accessibility-tree synchronization in every policy guard.
            return focused() ? fixture.getPackageName() : "";
        }
        private android.view.Display display() { return fixture.getWindowManager().getDefaultDisplay(); }
        public void checkGeometry(int width, int height, int rotation) {
            var metrics = new android.util.DisplayMetrics();
            display().getRealMetrics(metrics);
            assertEquals(width, metrics.widthPixels);
            assertEquals(height, metrics.heightPixels);
            assertEquals(rotation, display().getRotation());
        }
        public String observe() throws Exception {
            instrumentation.waitForIdleSync();
            long capturedAt = now();
            Bitmap screen = instrumentation.getUiAutomation().takeScreenshot();
            assertNotNull("Native screenshot unavailable", screen);
            Bitmap image;
            try { image = screen.copy(Bitmap.Config.ARGB_8888, false); }
            finally { screen.recycle(); }
            assertNotNull(image);
            lastCaptureMs = now() - capturedAt;
            long ocrStarted = now();
            Task<Text> task = null;
            try {
                // Warm frame + first observation have completed. Delay the
                // second observation in a dedicated zero-input regression.
                if ("stale".equals(mode) && frames == 2) SystemClock.sleep(2700);
                task = recognizer.process(InputImage.fromBitmap(image, 0));
                Text text = Tasks.await(task, 20, TimeUnit.SECONDS);
                JSONArray items = new JSONArray();
                for (Text.TextBlock block : text.getTextBlocks()) for (Text.Line line : block.getLines()) {
                    Rect b = line.getBoundingBox();
                    if (b == null) continue;
                    items.put(new JSONObject().put("text", line.getText()).put("confidence", line.getConfidence())
                        .put("bounds", new JSONObject().put("left", b.left).put("top", b.top)
                            .put("right", b.right).put("bottom", b.bottom)));
                }
                var metrics = new android.util.DisplayMetrics();
                display().getRealMetrics(metrics);
                frames++;
                lastFrameMs = now() - capturedAt;
                lastOcrMs = now() - ocrStarted;
                lastWidth = image.getWidth(); lastHeight = image.getHeight(); lastLines = items.length();
                android.util.Log.i("AutomationOCR", "mode=" + mode + " frame=" + frames +
                    " width=" + image.getWidth() + " height=" + image.getHeight() +
                    " elapsedMs=" + lastFrameMs + " captureMs=" + lastCaptureMs +
                    " ocrMs=" + lastOcrMs + " lines=" + items.length());
                return new JSONObject().put("width", image.getWidth()).put("height", image.getHeight())
                    .put("displayWidth", metrics.widthPixels).put("displayHeight", metrics.heightPixels)
                    .put("rotation", display().getRotation()).put("capturedAt", capturedAt)
                    .put("items", items).toString();
            } finally {
                // On timeout the native task may still own the bitmap.
                if (task == null || task.isComplete()) image.recycle();
                else task.addOnCompleteListener(Runnable::run, ignored -> image.recycle());
            }
        }
        public void tap(int x, int y) {
            assertTrue("Fixture lost focus", focused());
            assertEquals(instrumentation.getTargetContext().getPackageName(), foreground());
            var metrics = new android.util.DisplayMetrics();
            display().getRealMetrics(metrics);
            assertTrue(x >= 0 && y >= 0 && x < metrics.widthPixels && y < metrics.heightPixels);
            assertEquals("Policy requested repeated input", 0, requests++);
            long time = now();
            MotionEvent down = MotionEvent.obtain(time, time, MotionEvent.ACTION_DOWN, x, y, 0);
            MotionEvent up = MotionEvent.obtain(time, time + 20, MotionEvent.ACTION_UP, x, y, 0);
            try { instrumentation.sendPointerSync(down); instrumentation.sendPointerSync(up); }
            finally { down.recycle(); up.recycle(); }
        }
    }
}
