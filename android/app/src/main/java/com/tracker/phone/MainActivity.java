package com.tracker.phone;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.provider.Settings;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/**
 * The only screen: 1) paste your private key, 2) turn on Usage access, 3) done — it sends every hour by itself.
 * Black & white, like the tracker website.
 */
public class MainActivity extends Activity {

    private EditText keyField;
    private TextView keyState, accessState, lastState, todayView;
    private Button accessBtn;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().setStatusBarColor(Color.WHITE);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);

        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(20), dp(28), dp(20), dp(28));
        col.setBackgroundColor(Color.WHITE);

        col.addView(text("Tracker Phone", 30, true, Color.BLACK));
        col.addView(text("Measures your phone time and sends it to your tracker every hour. Set it up once.", 15, false, 0xFF737373), gap(6));

        // 1. key
        col.addView(text("1 · Your private key", 13, true, 0xFF737373), gap(28));
        keyField = new EditText(this);
        keyField.setHint("wt_…");
        keyField.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD);
        keyField.setSingleLine(true);
        keyField.setText(Sync.prefs(this).getString(Sync.KEY, ""));
        keyField.setBackground(box(false));
        keyField.setPadding(dp(14), dp(12), dp(14), dp(12));
        col.addView(keyField, gap(8));
        LinearLayout row = new LinearLayout(this);
        row.addView(button("Paste key", false, v -> {
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            ClipData clip = cm == null ? null : cm.getPrimaryClip();
            if (clip != null && clip.getItemCount() > 0) {
                CharSequence t = clip.getItemAt(0).coerceToText(this);
                String found = findKey(t == null ? "" : t.toString());
                keyField.setText(found);
            }
            saveKey();
        }));
        row.addView(button("Save", true, v -> saveKey()), side(8));
        col.addView(row, gap(8));
        keyState = text("", 14, false, 0xFF737373);
        col.addView(keyState, gap(6));

        // 2. usage access
        col.addView(text("2 · Usage access", 13, true, 0xFF737373), gap(26));
        accessState = text("", 15, false, Color.BLACK);
        col.addView(accessState, gap(6));
        accessBtn = button("Turn on usage access", true, v -> {
            try {
                startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));
            } catch (Exception e) {
                startActivity(new Intent(Settings.ACTION_SETTINGS));
            }
        });
        col.addView(accessBtn, gap(8));
        col.addView(text("In the list tap Tracker Phone, then switch on “Permit usage access”.", 13, false, 0xFF737373), gap(6));

        // 3. status
        col.addView(text("3 · Sending", 13, true, 0xFF737373), gap(26));
        lastState = text("", 15, false, Color.BLACK);
        col.addView(lastState, gap(6));
        col.addView(button("Send now", false, v -> sendNow()), gap(8));

        col.addView(text("Today on this phone", 13, true, 0xFF737373), gap(26));
        todayView = text("", 15, false, Color.BLACK);
        todayView.setLineSpacing(0, 1.25f);
        col.addView(todayView, gap(6));

        ScrollView sv = new ScrollView(this);
        sv.setBackgroundColor(Color.WHITE);
        sv.addView(col);
        setContentView(sv);
        Sync.schedule(this);
    }

    @Override
    protected void onResume() {
        super.onResume();
        refresh();
        if (ready()) sendNow();
    }

    private boolean ready() {
        return Sync.prefs(this).getString(Sync.KEY, "").length() >= 20 && Sync.hasUsageAccess(this);
    }

    private void saveKey() {
        String k = findKey(keyField.getText().toString());
        keyField.setText(k);
        Sync.prefs(this).edit().putString(Sync.KEY, k).apply();
        refresh();
        if (ready()) sendNow();
    }

    /** Accepts the key on its own or inside other copied text. */
    private static String findKey(String s) {
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("wt_[0-9a-fA-F]{20,}").matcher(s);
        return m.find() ? m.group() : s.trim();
    }

    private void sendNow() {
        lastState.setText("Sending…");
        new Thread(() -> {
            String msg = Sync.run(getApplicationContext());
            runOnUiThread(() -> {
                lastState.setText(msg);
                refresh();
            });
        }).start();
    }

    private void refresh() {
        String key = Sync.prefs(this).getString(Sync.KEY, "");
        keyState.setText(key.length() >= 20 ? "Saved ✓" : "Copy the key from the tracker website (Phone page), then tap Paste key.");
        boolean access = Sync.hasUsageAccess(this);
        accessState.setText(access ? "On ✓" : "Off. Tracker Phone can’t measure until you turn it on.");
        accessBtn.setVisibility(access ? View.GONE : View.VISIBLE);
        String last = Sync.prefs(this).getString("last", "");
        if (!"Sending…".contentEquals(lastState.getText())) lastState.setText(last.isEmpty() ? "Not sent yet." : last);

        if (access) {
            new Thread(() -> {
                Usage.Day d = Usage.measure(getApplicationContext(), 0);
                StringBuilder sb = new StringBuilder("Total " + Sync.fmt(d.totalMs) + " · unlocked " + d.unlocks + " times\n");
                int n = 0;
                for (Usage.App a : d.apps) {
                    sb.append("\n").append(a.name).append("  ").append(Sync.fmt(a.ms));
                    if (++n >= 8) break;
                }
                String out = sb.toString();
                runOnUiThread(() -> todayView.setText(out));
            }).start();
        } else {
            todayView.setText("—");
        }
    }

    /* ---------------- tiny UI helpers ---------------- */

    private int dp(int v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    private TextView text(String s, int sp, boolean bold, int color) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return t;
    }

    private Button button(String label, boolean solid, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(15);
        b.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        b.setTextColor(solid ? Color.WHITE : Color.BLACK);
        GradientDrawable g = new GradientDrawable();
        g.setCornerRadius(dp(999));
        g.setColor(solid ? Color.BLACK : Color.WHITE);
        g.setStroke(dp(1), Color.BLACK);
        b.setBackground(g);
        b.setPadding(dp(20), 0, dp(20), 0);
        b.setMinHeight(dp(44));
        b.setStateListAnimator(null);
        b.setGravity(Gravity.CENTER);
        b.setOnClickListener(l);
        return b;
    }

    private GradientDrawable box(boolean dark) {
        GradientDrawable g = new GradientDrawable();
        g.setCornerRadius(dp(10));
        g.setColor(Color.WHITE);
        g.setStroke(dp(1), dark ? Color.BLACK : 0xFFE7E7E7);
        return g;
    }

    private LinearLayout.LayoutParams gap(int top) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        p.topMargin = dp(top);
        return p;
    }

    private LinearLayout.LayoutParams side(int left) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        p.leftMargin = dp(left);
        return p;
    }
}
