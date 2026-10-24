package dev.androidautomation.harness;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.widget.*;
import java.io.InputStream;
import java.io.OutputStream;

/** Milestone delivery UI. Never executes scripts or requests privileged input. */
public class MilestoneActivity extends Activity {
    private static final int EXPORT_SCRIPT = 1;
    private TextView status;
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(32, 48, 32, 32);
        TextView title = new TextView(this);
        title.setText("Android Automation · 节点体验版");
        title.setTextSize(24);
        layout.addView(title);
        status = new TextView(this);
        status.setText("本 APK 提供手动测试页及脚本导出。\n自动化运行仍需 AutoJs6 6.7.0 + Shizuku；本 APK 不执行截图、OCR 或游戏操作。\n尚未完成 Redmi 真机验收。");
        layout.addView(status);
        Button fixture = new Button(this);
        fixture.setText("打开手动测试页");
        fixture.setOnClickListener(v -> startActivity(new Intent(this, FixtureActivity.class)));
        layout.addView(fixture);
        Button export = new Button(this);
        export.setText("导出 AutoJs6 脚本");
        export.setOnClickListener(v -> {
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/javascript");
            intent.putExtra(Intent.EXTRA_TITLE, "AndroidAutomation.js");
            startActivityForResult(intent, EXPORT_SCRIPT);
        });
        layout.addView(export);
        TextView help = new TextView(this);
        help.setText("导出后，在官方 AutoJs6 中打开脚本，先运行本机闭环自测。\n手动点击测试页产生 PASS 只证明按钮可用，不算自动化验收。");
        layout.addView(help);
        setContentView(layout);
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != EXPORT_SCRIPT || result != RESULT_OK || data == null || data.getData() == null) return;
        try (InputStream in = getAssets().open("AndroidAutomation.js");
             OutputStream out = getContentResolver().openOutputStream(data.getData())) {
            if (out == null) throw new java.io.IOException("No output stream");
            byte[] buffer = new byte[8192];
            int count;
            while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
            status.setText("脚本已导出。请用 AutoJs6 打开并先自测；尚未建立真机或游戏验收。");
        } catch (Exception error) {
            status.setText("导出失败，请重新选择保存位置。");
        }
    }
}
