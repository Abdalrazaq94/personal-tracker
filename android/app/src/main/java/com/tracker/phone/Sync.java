package com.tracker.phone;

import android.app.AlarmManager;
import android.app.AppOpsManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Process;
import android.os.SystemClock;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Scanner;

/** Sends today's and yesterday's phone time to the tracker, and keeps an hourly reminder to do it again. */
final class Sync {

    static final String URL_INGEST = "https://sxokmmvvsrcwherlcoxv.supabase.co/functions/v1/ingest";
    static final String PREFS = "tracker";
    static final String KEY = "key";

    private Sync() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean hasUsageAccess(Context c) {
        AppOpsManager ops = (AppOpsManager) c.getSystemService(Context.APP_OPS_SERVICE);
        if (ops == null) return false;
        int mode = android.os.Build.VERSION.SDK_INT >= 29
                ? ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.getPackageName())
                : ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.getPackageName());
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    /** About once an hour (Android may shift it a little to save battery). */
    static void schedule(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent i = new Intent(c, SyncReceiver.class).setAction(SyncReceiver.ACTION);
        PendingIntent pi = PendingIntent.getBroadcast(c, 1, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.setInexactRepeating(
                AlarmManager.ELAPSED_REALTIME,
                SystemClock.elapsedRealtime() + AlarmManager.INTERVAL_HALF_HOUR,
                AlarmManager.INTERVAL_HOUR,
                pi);
    }

    /** Measures and sends. Runs on a background thread. Returns a short message for the screen. */
    static String run(Context c) {
        SharedPreferences p = prefs(c);
        String key = p.getString(KEY, "").trim();
        if (key.length() < 20) return "Add your private key first.";
        if (!hasUsageAccess(c)) return "Turn on Usage access for Tracker Phone first.";
        try {
            JSONArray days = new JSONArray();
            Usage.Day today = null;
            for (int ago = 0; ago <= 1; ago++) {
                Usage.Day d = Usage.measure(c, ago);
                if (ago == 0) today = d;
                JSONObject o = new JSONObject();
                o.put("day", d.day);
                o.put("total_minutes", Math.round(d.totalMs / 60000.0));
                o.put("unlocks", d.unlocks);
                JSONArray apps = new JSONArray();
                for (Usage.App a : d.apps) {
                    long min = Math.round(a.ms / 60000.0);
                    if (min < 1) continue;
                    apps.put(new JSONObject().put("name", a.name).put("minutes", min));
                    if (apps.length() >= 40) break;
                }
                o.put("apps", apps);
                days.put(o);
            }
            JSONObject body = new JSONObject().put("token", key).put("kind", "screentime").put("days", days);
            String reply = post(body.toString());
            JSONObject r = new JSONObject(reply);
            if (r.has("error")) {
                p.edit().putString("last", "Problem: " + r.optString("error")).apply();
                return "Problem: " + r.optString("error");
            }
            String msg = "Sent " + time() + " · today " + fmt(today.totalMs);
            p.edit().putString("last", msg).putLong("lastAt", System.currentTimeMillis()).apply();
            return msg;
        } catch (Exception e) {
            String msg = "Couldn't send (" + e.getClass().getSimpleName() + "). It will try again in an hour.";
            p.edit().putString("last", msg).apply();
            return msg;
        }
    }

    private static String post(String json) throws Exception {
        HttpURLConnection h = (HttpURLConnection) new URL(URL_INGEST).openConnection();
        h.setRequestMethod("POST");
        h.setConnectTimeout(20000);
        h.setReadTimeout(30000);
        h.setDoOutput(true);
        h.setRequestProperty("Content-Type", "application/json");
        try (OutputStream o = h.getOutputStream()) {
            o.write(json.getBytes(StandardCharsets.UTF_8));
        }
        int code = h.getResponseCode();
        InputStream in = code >= 400 ? h.getErrorStream() : h.getInputStream();
        String text = "";
        if (in != null) {
            try (Scanner s = new Scanner(in, "UTF-8").useDelimiter("\\A")) {
                text = s.hasNext() ? s.next() : "";
            }
        }
        if (text.isEmpty()) text = "{\"error\":\"Server answered " + code + "\"}";
        if (!text.trim().startsWith("{")) text = "{\"error\":\"Server answered " + code + ". Is the ingest function deployed?\"}";
        return text;
    }

    static String fmt(long ms) {
        long m = Math.round(ms / 60000.0);
        return m >= 60 ? (m / 60) + "h " + (m % 60) + "m" : m + "m";
    }

    private static String time() {
        java.text.DateFormat f = java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT);
        return f.format(new java.util.Date());
    }
}
