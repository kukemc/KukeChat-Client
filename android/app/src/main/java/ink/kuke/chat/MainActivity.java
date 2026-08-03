package ink.kuke.chat;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowInsetsController;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(KukeBackgroundRealtimePlugin.class);
        registerPlugin(KukeSystemBarsPlugin.class);
        registerPlugin(KukeUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
        handleOpenConversationIntent(getIntent());
        Window window = getWindow();
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false);
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_DEFAULT);
            }
        }
        KukeSystemBarsPlugin.applySystemBars(window, true);
    }

    @Override
    protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleOpenConversationIntent(intent);
    }

    private void handleOpenConversationIntent(android.content.Intent intent) {
        if (intent == null) {
            return;
        }
        int conversationId = intent.getIntExtra(KukeBackgroundRealtimeService.EXTRA_OPEN_CONVERSATION_ID, -1);
        if (conversationId > 0) {
            KukeBackgroundRealtimePlugin.notifyOpenConversation(this, conversationId);
            intent.removeExtra(KukeBackgroundRealtimeService.EXTRA_OPEN_CONVERSATION_ID);
        }
    }
}
