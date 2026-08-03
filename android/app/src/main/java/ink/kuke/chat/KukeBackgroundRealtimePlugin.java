package ink.kuke.chat;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.app.NotificationManager;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "KukeBackgroundRealtime")
public class KukeBackgroundRealtimePlugin extends Plugin {
    private static final String PREFS_NAME = "kukechat_background_realtime";
    private static final String KEY_PENDING_OPEN_CONVERSATION_ID = "pending_open_conversation_id";
    private static KukeBackgroundRealtimePlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @PluginMethod
    public void configure(PluginCall call) {
        saveConfig(call.getString("token", ""), call.getString("wsUrl", ""), call.getString("apiBaseUrl", ""), call.getInt("currentUserId", -1), call.getBoolean("appForeground", true));
        call.resolve();
    }

    @PluginMethod
    public void start(PluginCall call) {
        String token = call.getString("token", "");
        String wsUrl = call.getString("wsUrl", "");
        String apiBaseUrl = call.getString("apiBaseUrl", "");
        int currentUserId = call.getInt("currentUserId", -1);
        boolean appForeground = call.getBoolean("appForeground", true);

        if (!token.isEmpty() && !wsUrl.isEmpty()) {
            saveConfig(token, wsUrl, apiBaseUrl, currentUserId, appForeground);
        }

        Intent intent = new Intent(getContext(), KukeBackgroundRealtimeService.class);
        intent.setAction(KukeBackgroundRealtimeService.ACTION_START);
        intent.putExtra(KukeBackgroundRealtimeService.EXTRA_TOKEN, token);
        intent.putExtra(KukeBackgroundRealtimeService.EXTRA_WS_URL, wsUrl);
        intent.putExtra(KukeBackgroundRealtimeService.EXTRA_API_BASE_URL, apiBaseUrl);
        intent.putExtra(KukeBackgroundRealtimeService.EXTRA_CURRENT_USER_ID, currentUserId);
        intent.putExtra(KukeBackgroundRealtimeService.EXTRA_APP_FOREGROUND, appForeground);
        ContextCompat.startForegroundService(getContext(), intent);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), KukeBackgroundRealtimeService.class);
        intent.setAction(KukeBackgroundRealtimeService.ACTION_STOP);
        intent.putExtra(KukeBackgroundRealtimeService.EXTRA_CLEAR_SESSION, call.getBoolean("clearSession", false));
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void setAppState(PluginCall call) {
        Intent intent = new Intent(getContext(), KukeBackgroundRealtimeService.class);
        intent.setAction(KukeBackgroundRealtimeService.ACTION_APP_STATE);
        intent.putExtra(KukeBackgroundRealtimeService.EXTRA_APP_FOREGROUND, call.getBoolean("foreground", true));
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void clearMessageNotifications(PluginCall call) {
        NotificationManager notificationManager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager != null) {
            notificationManager.cancelAll();
        }
        Intent intent = new Intent(getContext(), KukeBackgroundRealtimeService.class);
        intent.setAction(KukeBackgroundRealtimeService.ACTION_CLEAR_MESSAGE_NOTIFICATIONS);
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void updateConversations(PluginCall call) {
        JSArray conversations = call.getArray("conversations");
        String conversationsJson = conversations == null ? "[]" : conversations.toString();
        getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KukeBackgroundRealtimeService.EXTRA_CONVERSATIONS, conversationsJson)
            .apply();

        Intent intent = new Intent(getContext(), KukeBackgroundRealtimeService.class);
        intent.setAction(KukeBackgroundRealtimeService.ACTION_UPDATE_CONVERSATIONS);
        intent.putExtra(KukeBackgroundRealtimeService.EXTRA_CONVERSATIONS, conversationsJson);
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void consumePendingOpenConversation(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        int conversationId = prefs.getInt(KEY_PENDING_OPEN_CONVERSATION_ID, -1);
        if (conversationId > 0) {
            prefs.edit().remove(KEY_PENDING_OPEN_CONVERSATION_ID).apply();
        }
        JSObject result = new JSObject();
        if (conversationId > 0) {
            result.put("conversationId", conversationId);
        }
        call.resolve(result);
    }

    public static void notifyOpenConversation(Context context, int conversationId) {
        if (conversationId <= 0) {
            return;
        }
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putInt(KEY_PENDING_OPEN_CONVERSATION_ID, conversationId)
            .apply();
        if (instance != null) {
            JSObject data = new JSObject();
            data.put("conversationId", conversationId);
            instance.notifyListeners("openConversation", data, true);
        }
    }

    private void saveConfig(String token, String wsUrl, String apiBaseUrl, int currentUserId, boolean appForeground) {
        getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KukeBackgroundRealtimeService.EXTRA_TOKEN, token)
            .putString(KukeBackgroundRealtimeService.EXTRA_WS_URL, wsUrl)
            .putString(KukeBackgroundRealtimeService.EXTRA_API_BASE_URL, apiBaseUrl)
            .putInt(KukeBackgroundRealtimeService.EXTRA_CURRENT_USER_ID, currentUserId)
            .putBoolean(KukeBackgroundRealtimeService.EXTRA_APP_FOREGROUND, appForeground)
            .apply();
    }
}
