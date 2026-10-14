package com.tracker.phone;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Wakes up every hour (and after the phone restarts) to send phone time. */
public class SyncReceiver extends BroadcastReceiver {

    static final String ACTION = "com.tracker.phone.SYNC";

    @Override
    public void onReceive(Context context, Intent intent) {
        final Context app = context.getApplicationContext();
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            Sync.schedule(app);
        }
        final PendingResult done = goAsync();
        new Thread(() -> {
            try {
                Sync.run(app);
            } finally {
                done.finish();
            }
        }).start();
    }
}
