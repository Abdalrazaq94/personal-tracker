package com.tracker.phone;

import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Measures phone time for one day from Android's own usage records (the same data Digital Wellbeing uses):
 * the time each app was on screen, and how many times the phone was unlocked.
 */
final class Usage {

    static final class App {
        final String name;
        final long ms;

        App(String name, long ms) {
            this.name = name;
            this.ms = ms;
        }
    }

    static final class Day {
        String day; // YYYY-MM-DD
        long totalMs;
        int unlocks;
        List<App> apps = new ArrayList<>();
    }

    // event types (numbers so this also builds against older SDK constants)
    private static final int RESUMED = 1; // ACTIVITY_RESUMED / MOVE_TO_FOREGROUND
    private static final int PAUSED = 2; // ACTIVITY_PAUSED / MOVE_TO_BACKGROUND
    private static final int SCREEN_OFF = 16; // SCREEN_NON_INTERACTIVE
    private static final int KEYGUARD_SHOWN = 17;
    private static final int KEYGUARD_HIDDEN = 18; // = an unlock
    private static final int STOPPED = 23; // ACTIVITY_STOPPED
    private static final long MAX_SESSION = 4L * 60 * 60 * 1000; // ignore broken records longer than 4 h

    private Usage() {}

    /** daysAgo = 0 → today (midnight until now), 1 → yesterday (whole day). */
    static Day measure(Context ctx, int daysAgo) {
        Calendar c = Calendar.getInstance();
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        c.add(Calendar.DAY_OF_YEAR, -daysAgo);
        long start = c.getTimeInMillis();
        long end = daysAgo == 0 ? System.currentTimeMillis() : start + 24L * 60 * 60 * 1000;

        Day d = new Day();
        d.day = String.format("%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));

        UsageStatsManager usm = (UsageStatsManager) ctx.getSystemService(Context.USAGE_STATS_SERVICE);
        if (usm == null) return d;
        UsageEvents events = usm.queryEvents(start, end);
        Set<String> skip = skipped(ctx);

        Map<String, Long> perApp = new HashMap<>();
        String current = null;
        long since = 0;
        UsageEvents.Event e = new UsageEvents.Event();
        while (events.hasNextEvent()) {
            events.getNextEvent(e);
            int type = e.getEventType();
            String pkg = e.getPackageName();
            long t = e.getTimeStamp();
            if (type == RESUMED) {
                if (current != null && !current.equals(pkg)) add(perApp, current, t - since);
                if (current == null || !current.equals(pkg)) {
                    current = pkg;
                    since = t;
                }
            } else if ((type == PAUSED || type == STOPPED) && pkg.equals(current)) {
                add(perApp, current, t - since);
                current = null;
            } else if (type == SCREEN_OFF || type == KEYGUARD_SHOWN) {
                if (current != null) add(perApp, current, t - since);
                current = null;
            } else if (type == KEYGUARD_HIDDEN) {
                d.unlocks++;
            }
        }
        if (current != null) add(perApp, current, end - since);

        PackageManager pm = ctx.getPackageManager();
        for (Map.Entry<String, Long> en : perApp.entrySet()) {
            if (skip.contains(en.getKey()) || en.getValue() < 30_000) continue; // under 30 s: ignore
            d.apps.add(new App(label(pm, en.getKey()), en.getValue()));
            d.totalMs += en.getValue();
        }
        d.apps.sort((a, b) -> Long.compare(b.ms, a.ms));
        return d;
    }

    private static void add(Map<String, Long> m, String pkg, long ms) {
        if (ms <= 0) return;
        m.put(pkg, (m.containsKey(pkg) ? m.get(pkg) : 0L) + Math.min(ms, MAX_SESSION));
    }

    /** Home screens, the system bar and this app itself don't count as phone time. */
    private static Set<String> skipped(Context ctx) {
        Set<String> s = new HashSet<>();
        s.add(ctx.getPackageName());
        s.add("com.android.systemui");
        s.add("android");
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        for (ResolveInfo r : ctx.getPackageManager().queryIntentActivities(home, 0)) s.add(r.activityInfo.packageName);
        return s;
    }

    private static String label(PackageManager pm, String pkg) {
        try {
            ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
            CharSequence l = pm.getApplicationLabel(ai);
            if (l != null && l.length() > 0) return l.toString();
        } catch (Exception ignored) {
        }
        String[] parts = pkg.split("\\.");
        String last = parts[parts.length - 1];
        return last.isEmpty() ? pkg : Character.toUpperCase(last.charAt(0)) + last.substring(1);
    }
}
