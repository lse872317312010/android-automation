package dev.androidautomation.harness;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.UUID;

/** Inert emulator fixture: no launcher, storage, network, OCR or Shizuku. */
public class FixtureActivity extends Activity {
    static final int BEFORE = Color.rgb(32, 48, 64);
    static final int AFTER = Color.rgb(24, 160, 80);
    LinearLayout panel;
    Button target;
    TextView outcome;
    final String token = UUID.randomUUID().toString();
    int tapCount;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(32, 32, 32, 32);
        panel.setBackgroundColor(BEFORE);
        target = new Button(this);
        target.setText("TEST " + token);
        outcome = new TextView(this);
        outcome.setText("READY");
        outcome.setTextColor(Color.WHITE);
        panel.addView(target, new LinearLayout.LayoutParams(-1, 160));
        panel.addView(outcome, new LinearLayout.LayoutParams(-1, 100));
        target.setOnClickListener(view -> {
            tapCount++;
            outcome.setText("PASS " + token);
            panel.setBackgroundColor(AFTER);
        });
        setContentView(panel);
    }
}
