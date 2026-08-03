package ink.kuke.chat;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;

public class KukeBackgroundRealtimeService extends Service {
    public static final String ACTION_START = "ink.kuke.chat.background.START";
    public static final String ACTION_STOP = "ink.kuke.chat.background.STOP";
    public static final String ACTION_APP_STATE = "ink.kuke.chat.background.APP_STATE";
    public static final String ACTION_UPDATE_CONVERSATIONS = "ink.kuke.chat.background.UPDATE_CONVERSATIONS";
    public static final String ACTION_CLEAR_MESSAGE_NOTIFICATIONS = "ink.kuke.chat.background.CLEAR_MESSAGE_NOTIFICATIONS";
    public static final String EXTRA_TOKEN = "token";
    public static final String EXTRA_WS_URL = "wsUrl";
    public static final String EXTRA_API_BASE_URL = "apiBaseUrl";
    public static final String EXTRA_CURRENT_USER_ID = "currentUserId";
    public static final String EXTRA_APP_FOREGROUND = "appForeground";
    public static final String EXTRA_CLEAR_SESSION = "clearSession";
    public static final String EXTRA_OPEN_CONVERSATION_ID = "kukechat_conversation_id";
    public static final String EXTRA_CONVERSATIONS = "conversations";

    private static final String PREFS_NAME = "kukechat_background_realtime";
    private static final String CHANNEL_MESSAGES = "messages";
    private static final String CHANNEL_SERVICE = "realtime";
    private static final int SERVICE_NOTIFICATION_ID = 735001;
    private static final long HEARTBEAT_INTERVAL_MS = 25000L;
    private static final long RECONNECT_BASE_DELAY_MS = 1000L;
    private static final long RECONNECT_MAX_DELAY_MS = 30000L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Map<Integer, CachedConversation> conversations = new HashMap<>();
    private OkHttpClient client;
    private SharedPreferences prefs;
    private WebSocket webSocket;
    private String token = "";
    private String wsUrl = "";
    private String apiBaseUrl = "";
    private int currentUserId = -1;
    private boolean appForeground = true;
    private boolean explicitlyStopped = false;
    private int reconnectAttempt = 0;

    private final Runnable heartbeatRunnable = new Runnable() {
        @Override
        public void run() {
            WebSocket socket = webSocket;
            if (socket != null) {
                socket.send("ping");
                handler.postDelayed(this, HEARTBEAT_INTERVAL_MS);
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        client = new OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .pingInterval(0, TimeUnit.MILLISECONDS)
            .build();
        createNotificationChannels();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_STOP.equals(action)) {
            stopRealtime(intent != null && intent.getBooleanExtra(EXTRA_CLEAR_SESSION, false));
            return START_NOT_STICKY;
        }
        if (ACTION_APP_STATE.equals(action)) {
            appForeground = intent.getBooleanExtra(EXTRA_APP_FOREGROUND, appForeground);
            prefs.edit().putBoolean(EXTRA_APP_FOREGROUND, appForeground).apply();
            if (appForeground) {
                clearMessageNotifications();
            }
            return START_STICKY;
        }
        if (ACTION_CLEAR_MESSAGE_NOTIFICATIONS.equals(action)) {
            clearMessageNotifications();
            if (webSocket == null && token.isEmpty()) {
                stopSelf();
            }
            return START_STICKY;
        }
        if (ACTION_UPDATE_CONVERSATIONS.equals(action)) {
            String conversationsJson = intent.getStringExtra(EXTRA_CONVERSATIONS);
            updateCachedConversations(conversationsJson == null ? prefs.getString(EXTRA_CONVERSATIONS, "[]") : conversationsJson);
            if (webSocket == null && token.isEmpty()) {
                stopSelf();
            }
            return START_STICKY;
        }
        startRealtime(intent);
        return START_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        disconnectSocket();
        super.onDestroy();
    }

    private void startRealtime(Intent intent) {
        explicitlyStopped = false;
        readConfig(intent);
        if (token.isEmpty() || wsUrl.isEmpty()) {
            stopSelf();
            return;
        }
        updateCachedConversations(prefs.getString(EXTRA_CONVERSATIONS, "[]"));
        startForeground(SERVICE_NOTIFICATION_ID, buildServiceNotification());
        refreshConversations();
        connectSocket();
    }

    private void stopRealtime(boolean clearSession) {
        explicitlyStopped = true;
        if (clearSession) {
            prefs.edit().clear().apply();
        }
        disconnectSocket();
        stopForeground(true);
        stopSelf();
    }

    private void readConfig(Intent intent) {
        if (intent != null && intent.hasExtra(EXTRA_TOKEN)) {
            token = intent.getStringExtra(EXTRA_TOKEN) == null ? "" : intent.getStringExtra(EXTRA_TOKEN);
            wsUrl = intent.getStringExtra(EXTRA_WS_URL) == null ? "" : intent.getStringExtra(EXTRA_WS_URL);
            apiBaseUrl = intent.getStringExtra(EXTRA_API_BASE_URL) == null ? "" : intent.getStringExtra(EXTRA_API_BASE_URL);
            currentUserId = intent.getIntExtra(EXTRA_CURRENT_USER_ID, -1);
            appForeground = intent.getBooleanExtra(EXTRA_APP_FOREGROUND, true);
            prefs.edit()
                .putString(EXTRA_TOKEN, token)
                .putString(EXTRA_WS_URL, wsUrl)
                .putString(EXTRA_API_BASE_URL, apiBaseUrl)
                .putInt(EXTRA_CURRENT_USER_ID, currentUserId)
                .putBoolean(EXTRA_APP_FOREGROUND, appForeground)
                .apply();
            return;
        }
        token = prefs.getString(EXTRA_TOKEN, "");
        wsUrl = prefs.getString(EXTRA_WS_URL, "");
        apiBaseUrl = prefs.getString(EXTRA_API_BASE_URL, "");
        currentUserId = prefs.getInt(EXTRA_CURRENT_USER_ID, -1);
        appForeground = intent != null && intent.hasExtra(EXTRA_APP_FOREGROUND)
            ? intent.getBooleanExtra(EXTRA_APP_FOREGROUND, false)
            : prefs.getBoolean(EXTRA_APP_FOREGROUND, false);
    }

    private void connectSocket() {
        if (webSocket != null || explicitlyStopped || token.isEmpty() || wsUrl.isEmpty()) {
            return;
        }
        Request request = new Request.Builder().url(buildSocketUrl(wsUrl, token)).build();
        webSocket = client.newWebSocket(request, new WebSocketListener() {
            @Override
            public void onOpen(WebSocket socket, Response response) {
                reconnectAttempt = 0;
                handler.removeCallbacks(heartbeatRunnable);
                handler.postDelayed(heartbeatRunnable, HEARTBEAT_INTERVAL_MS);
                updateServiceNotification("后台实时消息已连接");
            }

            @Override
            public void onMessage(WebSocket socket, String text) {
                if ("pong".equals(text)) {
                    return;
                }
                handleRealtimePayload(text);
            }

            @Override
            public void onClosed(WebSocket socket, int code, String reason) {
                handleSocketClosed();
            }

            @Override
            public void onFailure(WebSocket socket, Throwable t, Response response) {
                handleSocketClosed();
            }
        });
    }

    private void handleSocketClosed() {
        handler.removeCallbacks(heartbeatRunnable);
        webSocket = null;
        if (!explicitlyStopped) {
            updateServiceNotification("后台实时消息重连中");
            scheduleReconnect();
        }
    }

    private void scheduleReconnect() {
        long delay = Math.min(RECONNECT_BASE_DELAY_MS * (1L << Math.min(reconnectAttempt, 5)), RECONNECT_MAX_DELAY_MS);
        reconnectAttempt += 1;
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                connectSocket();
            }
        }, delay);
    }

    private void disconnectSocket() {
        handler.removeCallbacksAndMessages(null);
        if (webSocket != null) {
            webSocket.close(1000, "service stopped");
            webSocket = null;
        }
    }

    private void clearMessageNotifications() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }
        manager.cancelAll();
        updateServiceNotification(webSocket != null ? "后台实时消息已连接" : "正在保持消息连接");
    }

    private void handleRealtimePayload(String payload) {
        try {
            JSONObject event = new JSONObject(payload);
            String type = event.optString("type", "");
            if ("message.created".equals(type)) {
                JSONObject message = event.optJSONObject("data");
                if (message != null) {
                    handleMessageCreated(message);
                }
            } else if (type.startsWith("conversation.") || type.startsWith("group.") || type.startsWith("friend")) {
                refreshConversations();
            }
        } catch (JSONException ignored) {
        }
    }

    private void handleMessageCreated(JSONObject message) {
        int conversationId = message.optInt("conversation_id", -1);
        int senderId = message.optInt("sender_id", -1);
        if (conversationId <= 0 || senderId == currentUserId || appForeground) {
            return;
        }
        CachedConversation conversation;
        synchronized (conversations) {
            conversation = conversations.get(conversationId);
        }
        if (conversation != null && !conversation.canNotify()) {
            return;
        }
        showMessageNotification(conversationId, conversation, message);
    }

    private void refreshConversations() {
        if (token.isEmpty() || apiBaseUrl.isEmpty()) {
            return;
        }
        Request request = new Request.Builder()
            .url(joinApiPath(apiBaseUrl, "/conversations"))
            .header("Authorization", "Bearer " + token)
            .build();
        client.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                if (!response.isSuccessful() || response.body() == null) {
                    return;
                }
                try {
                    Object parsed = new JSONTokener(response.body().string()).nextValue();
                    JSONArray array = extractArray(parsed);
                    if (array == null) {
                        return;
                    }
                    Map<Integer, CachedConversation> next = new HashMap<>();
                    for (int index = 0; index < array.length(); index += 1) {
                        JSONObject item = array.optJSONObject(index);
                        CachedConversation conversation = CachedConversation.from(item);
                        if (conversation != null) {
                            next.put(conversation.id, conversation);
                        }
                    }
                    synchronized (conversations) {
                        conversations.clear();
                        conversations.putAll(next);
                    }
                    prefs.edit().putString(EXTRA_CONVERSATIONS, array.toString()).apply();
                } catch (JSONException ignored) {
                }
            }
        });
    }

    private void updateCachedConversations(String conversationsJson) {
        if (conversationsJson == null || conversationsJson.isEmpty()) {
            return;
        }
        try {
            Object parsed = new JSONTokener(conversationsJson).nextValue();
            JSONArray array = extractArray(parsed);
            if (array == null) {
                return;
            }
            Map<Integer, CachedConversation> next = new HashMap<>();
            for (int index = 0; index < array.length(); index += 1) {
                CachedConversation conversation = CachedConversation.from(array.optJSONObject(index));
                if (conversation != null) {
                    next.put(conversation.id, conversation);
                }
            }
            synchronized (conversations) {
                conversations.clear();
                conversations.putAll(next);
            }
        } catch (JSONException ignored) {
        }
    }

    private JSONArray extractArray(Object parsed) {
        if (parsed instanceof JSONArray) {
            return (JSONArray) parsed;
        }
        if (parsed instanceof JSONObject) {
            JSONObject object = (JSONObject) parsed;
            JSONArray data = object.optJSONArray("data");
            if (data != null) {
                return data;
            }
            JSONArray items = object.optJSONArray("items");
            if (items != null) {
                return items;
            }
            JSONArray results = object.optJSONArray("results");
            if (results != null) {
                return results;
            }
        }
        return null;
    }

    private void showMessageNotification(int conversationId, CachedConversation conversation, JSONObject message) {
        String senderName = firstNonEmpty(
            message.optString("sender_display_name", ""),
            readNestedString(message.optJSONObject("sender"), "nickname"),
            readNestedString(message.optJSONObject("sender"), "username"),
            "有人"
        );
        String title = conversation != null ? conversation.title : senderName;
        String body = conversation != null && "group".equals(conversation.type)
            ? senderName + "：" + messagePreview(message)
            : messagePreview(message);
        String avatarUrl = conversation != null ? conversation.avatarUrl : readNestedString(message.optJSONObject("sender"), "avatar_url");
        Bitmap avatar = loadBitmap(resolveAssetUrl(avatarUrl));

        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launchIntent == null) {
            launchIntent = new Intent(this, MainActivity.class);
        }
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        launchIntent.putExtra(EXTRA_OPEN_CONVERSATION_ID, conversationId);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            conversationId,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_MESSAGES)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE);
        if (avatar != null) {
            builder.setLargeIcon(avatar);
        }

        try {
            NotificationManagerCompat.from(this).notify((int) (System.currentTimeMillis() % 1000000000L), builder.build());
        } catch (SecurityException ignored) {
        }
    }

    private Notification buildServiceNotification() {
        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            SERVICE_NOTIFICATION_ID,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        return new NotificationCompat.Builder(this, CHANNEL_SERVICE)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle("KukeChat 后台实时消息")
            .setContentText("正在保持消息连接")
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build();
    }

    private void updateServiceNotification(String text) {
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_SERVICE)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle("KukeChat 后台实时消息")
            .setContentText(text)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build();
        try {
            NotificationManagerCompat.from(this).notify(SERVICE_NOTIFICATION_ID, notification);
        } catch (SecurityException ignored) {
        }
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }
        NotificationChannel messageChannel = new NotificationChannel(CHANNEL_MESSAGES, "消息通知", NotificationManager.IMPORTANCE_HIGH);
        messageChannel.setDescription("KukeChat 新消息提醒");
        manager.createNotificationChannel(messageChannel);
        NotificationChannel serviceChannel = new NotificationChannel(CHANNEL_SERVICE, "后台实时", NotificationManager.IMPORTANCE_LOW);
        serviceChannel.setDescription("保持 KukeChat 后台实时消息连接");
        manager.createNotificationChannel(serviceChannel);
    }

    private String buildSocketUrl(String rawWsUrl, String authToken) {
        return Uri.parse(rawWsUrl).buildUpon().appendQueryParameter("token", authToken).build().toString();
    }

    private String joinApiPath(String baseUrl, String path) {
        String cleanBase = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        String cleanPath = path.startsWith("/") ? path : "/" + path;
        String prefix = cleanBase.endsWith("/api/v1") ? "" : "/api/v1";
        return cleanBase + prefix + cleanPath;
    }

    private String resolveAssetUrl(String value) {
        if (value == null || value.isEmpty()) {
            return "";
        }
        if (value.startsWith("http://") || value.startsWith("https://")) {
            return value;
        }
        if (apiBaseUrl == null || apiBaseUrl.isEmpty()) {
            return value;
        }
        String origin = apiBaseUrl.replaceAll("/api/v1/?$", "").replaceAll("/$", "");
        return origin + (value.startsWith("/") ? value : "/" + value);
    }

    private Bitmap loadBitmap(String value) {
        if (value == null || value.isEmpty() || !(value.startsWith("http://") || value.startsWith("https://"))) {
            return null;
        }
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(value).openConnection();
            connection.setConnectTimeout(2500);
            connection.setReadTimeout(2500);
            try (InputStream stream = connection.getInputStream()) {
                return BitmapFactory.decodeStream(stream);
            }
        } catch (Exception ignored) {
            return null;
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private String messagePreview(JSONObject message) {
        String type = message.optString("type", "text");
        if ("image".equals(type)) {
            return "[图片]";
        }
        if ("voice".equals(type)) {
            return "[语音]";
        }
        if ("forward_bundle".equals(type)) {
            return "[聊天记录]";
        }
        String content = message.optString("content", "新消息").replaceAll("\\s+", " ").trim();
        return content.isEmpty() ? "新消息" : content;
    }

    private String readNestedString(JSONObject object, String key) {
        return object == null ? "" : object.optString(key, "");
    }

    private String firstNonEmpty(String... values) {
        for (String value : values) {
            if (value != null && !value.isEmpty()) {
                return value;
            }
        }
        return "";
    }

    private static class CachedConversation {
        final int id;
        final String type;
        final String title;
        final String avatarUrl;
        final String messageSetting;
        final boolean doNotDisturb;

        CachedConversation(int id, String type, String title, String avatarUrl, String messageSetting, boolean doNotDisturb) {
            this.id = id;
            this.type = type;
            this.title = title;
            this.avatarUrl = avatarUrl;
            this.messageSetting = messageSetting;
            this.doNotDisturb = doNotDisturb;
        }

        boolean canNotify() {
            return !doNotDisturb && !"silent".equals(messageSetting) && !"ignore".equals(messageSetting);
        }

        static CachedConversation from(JSONObject object) {
            if (object == null) {
                return null;
            }
            int id = object.optInt("id", -1);
            if (id <= 0) {
                return null;
            }
            JSONObject directUser = object.optJSONObject("direct_user");
            String title = firstNonEmptyStatic(
                object.optString("display_title", ""),
                object.optString("title", ""),
                directUser == null ? "" : directUser.optString("nickname", ""),
                directUser == null ? "" : directUser.optString("username", ""),
                "KukeChat"
            );
            String avatar = firstNonEmptyStatic(
                object.optString("avatar_url", ""),
                directUser == null ? "" : directUser.optString("avatar_url", "")
            );
            return new CachedConversation(
                id,
                object.optString("type", "direct"),
                title,
                avatar,
                object.optString("my_message_setting", "notify"),
                object.optBoolean("my_do_not_disturb", false)
            );
        }

        private static String firstNonEmptyStatic(String... values) {
            for (String value : values) {
                if (value != null && !value.isEmpty() && !"null".equals(value)) {
                    return value;
                }
            }
            return "";
        }
    }
}
