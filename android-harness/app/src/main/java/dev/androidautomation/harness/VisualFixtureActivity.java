package dev.androidautomation.harness;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Disposable OCR fixture. Only instrumentation can launch this Activity. */
public class VisualFixtureActivity extends Activity {
    public int deliveredTaps;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        String mode = getIntent().getStringExtra("mode");
        String token = getIntent().getStringExtra("token");
        LinearLayout panel = new LinearLayout(this);
        float density = getResources().getDisplayMetrics().density;
        int gap = Math.round(16 * density);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setPadding(gap, gap, gap, gap);
        panel.setBackgroundColor(Color.WHITE);
        TextView outcome = new TextView(this);
        outcome.setText("already".equals(mode) ? "PASS " + token : "READY");
        outcome.setTextColor(Color.BLACK);
        outcome.setTextSize(30);
        outcome.setTypeface(Typeface.MONOSPACE);
        outcome.setGravity(Gravity.CENTER);
        int count = "duplicate".equals(mode) ? 2 : 1;
        for (int i = 0; i < count; i++) {
            Button button = new Button(this);
            button.setText("TEST " + token);
            button.setTextSize(30);
            button.setTypeface(Typeface.MONOSPACE);
            button.setTextColor(Color.BLACK);
            button.setAllCaps(false);
            button.setOnClickListener(view -> {
                deliveredTaps++;
                if (!"ignored".equals(mode)) {
                    button.setText("DONE");
                    outcome.setText("PASS " + token);
                }
            });
            LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-1, Math.round(96 * density));
            layout.bottomMargin = gap;
            panel.addView(button, layout);
        }
        panel.addView(outcome, new LinearLayout.LayoutParams(-1, Math.round(64 * density)));
        setContentView(panel);
    }
}
