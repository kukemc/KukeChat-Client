package ink.kuke.chat;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

@CapacitorPlugin(name = "KukeUpdater")
public class KukeUpdaterPlugin extends Plugin {
    private final OkHttpClient httpClient = new OkHttpClient();

    @PluginMethod
    public void getCurrentVersion(PluginCall call) {
        try {
            Context context = getContext();
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            JSObject result = new JSObject();
            result.put("versionName", info.versionName);
            long code;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                code = info.getLongVersionCode();
            } else {
                code = info.versionCode;
            }
            result.put("versionCode", code);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("VERSION_UNAVAILABLE", e);
        }
    }

    @PluginMethod
    public void downloadApk(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("INVALID_URL", "缺少下载链接");
            return;
        }
        new Thread(new Runnable() {
            @Override
            public void run() {
                runDownload(call, url);
            }
        }).start();
    }

    private void runDownload(PluginCall call, String url) {
        try {
            File dir = new File(getContext().getCacheDir(), "updates");
            if (!dir.exists()) {
                dir.mkdirs();
            }
            File[] stale = dir.listFiles();
            if (stale != null) {
                for (File file : stale) {
                    if (file.getName().endsWith(".apk")) {
                        file.delete();
                    }
                }
            }
            File apk = new File(dir, "kukechat-update.apk");

            Request request = new Request.Builder().url(url).build();
            Response response = httpClient.newCall(request).execute();
            if (!response.isSuccessful() || response.body() == null) {
                call.reject("DOWNLOAD_FAILED", "下载失败: HTTP " + response.code());
                return;
            }

            ResponseBody body = response.body();
            long total = body.contentLength();
            InputStream in = body.byteStream();
            OutputStream out = new FileOutputStream(apk);
            byte[] buffer = new byte[8192];
            long downloaded = 0;
            long lastEmit = 0;
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
                downloaded += read;
                if (downloaded - lastEmit > 65536 || (total > 0 && downloaded >= total)) {
                    lastEmit = downloaded;
                    JSObject progress = new JSObject();
                    progress.put("downloaded", downloaded);
                    progress.put("total", total);
                    progress.put("progress", total > 0 ? (double) downloaded / (double) total : 0d);
                    notifyListeners("downloadProgress", progress);
                }
            }
            out.flush();
            out.close();
            in.close();
            response.close();

            if (apk.length() < 1024L * 1024L) {
                call.reject("DOWNLOAD_FAILED", "下载的安装包不完整");
                return;
            }

            JSObject result = new JSObject();
            result.put("path", apk.getAbsolutePath());
            call.resolve(result);
        } catch (Exception e) {
            call.reject("DOWNLOAD_FAILED", e);
        }
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        final String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("INVALID_PATH", "缺少安装包路径");
            return;
        }
        File apk = new File(path);
        if (!apk.exists()) {
            call.reject("FILE_NOT_FOUND", "安装包不存在");
            return;
        }

        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.getPackageManager().canRequestPackageInstalls()) {
            try {
                Intent settings = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + context.getPackageName())
                );
                settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(settings);
            } catch (Exception ignored) {
            }
            call.reject("PERMISSION_REQUIRED", "需要授予“安装未知应用”权限");
            return;
        }

        try {
            Uri apkUri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("INSTALL_FAILED", e);
        }
    }
}
