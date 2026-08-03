package ink.kuke.chat;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.core.content.ContextCompat;

public class KukeBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? "" : intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action) && !"android.intent.action.QUICKBOOT_POWERON".equals(action)) {
            return;
        }
        Intent serviceIntent = new Intent(context, KukeBackgroundRealtimeService.class);
        serviceIntent.setAction(KukeBackgroundRealtimeService.ACTION_START);
        serviceIntent.putExtra(KukeBackgroundRealtimeService.EXTRA_APP_FOREGROUND, false);
        try {
            ContextCompat.startForegroundService(context, serviceIntent);
        } catch (Exception ignored) {
        }
    }
}
