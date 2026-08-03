param([switch]$Release)

$ErrorActionPreference = 'Stop'

function Assert-Command($Name, $InstallHint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is not installed or not available in PATH. $InstallHint"
  }
}

function Ensure-AndroidSdk($ProjectRoot) {
  $SdkRoot = $env:ANDROID_HOME
  if (-not $SdkRoot) {
    $SdkRoot = $env:ANDROID_SDK_ROOT
  }
  if (-not $SdkRoot) {
    $SdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
  }

  $CmdlineToolsRoot = Join-Path $SdkRoot 'cmdline-tools'
  $LatestTools = Join-Path $CmdlineToolsRoot 'latest'
  $SdkManager = Join-Path $LatestTools 'bin\sdkmanager.bat'

  if (-not (Test-Path -LiteralPath $SdkManager)) {
    $TempRoot = Join-Path $env:TEMP 'kukechat-android-sdk'
    $ZipPath = Join-Path $TempRoot 'commandlinetools-win.zip'
    $ExtractRoot = Join-Path $TempRoot 'extract'
    $ToolsUrl = 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip'

    if (-not (Test-Path -LiteralPath $TempRoot)) {
      New-Item -ItemType Directory -Path $TempRoot | Out-Null
    }
    if (-not (Test-Path -LiteralPath $SdkRoot)) {
      New-Item -ItemType Directory -Path $SdkRoot | Out-Null
    }
    if (-not (Test-Path -LiteralPath $CmdlineToolsRoot)) {
      New-Item -ItemType Directory -Path $CmdlineToolsRoot | Out-Null
    }

    if (-not (Test-Path -LiteralPath $ZipPath)) {
      Invoke-WebRequest -Uri $ToolsUrl -OutFile $ZipPath
    }
    if (Test-Path -LiteralPath $ExtractRoot) {
      Remove-Item -LiteralPath $ExtractRoot -Recurse -Force
    }
    Expand-Archive -LiteralPath $ZipPath -DestinationPath $ExtractRoot -Force
    if (Test-Path -LiteralPath $LatestTools) {
      Remove-Item -LiteralPath $LatestTools -Recurse -Force
    }
    Move-Item -LiteralPath (Join-Path $ExtractRoot 'cmdline-tools') -Destination $LatestTools
  }

  if (-not (Test-Path -LiteralPath $SdkManager)) {
    throw 'sdkmanager.bat was not found after Android command-line tools installation.'
  }

  $env:ANDROID_HOME = $SdkRoot
  $env:ANDROID_SDK_ROOT = $SdkRoot
  $yes = ("y`n" * 100)
  $yes | & $SdkManager --licenses | Out-Host
  & $SdkManager 'platform-tools' 'platforms;android-34' 'build-tools;34.0.0' | Out-Host

  $LocalProperties = Join-Path $ProjectRoot 'android\local.properties'
  $SdkDir = $SdkRoot.Replace('\', '/')
  Set-Content -LiteralPath $LocalProperties -Value "sdk.dir=$SdkDir" -Encoding ASCII
}

function Patch-MainActivity($ProjectRoot) {
  $MainActivity = Join-Path $ProjectRoot 'android\app\src\main\java\ink\kuke\chat\MainActivity.java'
  $MainActivityDir = Split-Path -Parent $MainActivity
  if (-not (Test-Path -LiteralPath $MainActivityDir)) {
    return
  }
  $MainActivitySource = @'
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
'@
  Set-Content -LiteralPath $MainActivity -Value $MainActivitySource -Encoding ASCII
}

function Patch-SystemBarsPlugin($ProjectRoot) {
  $SystemBarsPlugin = Join-Path $ProjectRoot 'android\app\src\main\java\ink\kuke\chat\KukeSystemBarsPlugin.java'
  $SystemBarsPluginDir = Split-Path -Parent $SystemBarsPlugin
  if (-not (Test-Path -LiteralPath $SystemBarsPluginDir)) {
    return
  }
  $SystemBarsPluginSource = @'
package ink.kuke.chat;

import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.view.WindowInsetsController;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "KukeSystemBars")
public class KukeSystemBarsPlugin extends Plugin {
    @PluginMethod
    public void setStyle(PluginCall call) {
        boolean light = call.getBoolean("light", true);
        getActivity().runOnUiThread(() -> applySystemBars(getActivity().getWindow(), light));
        call.resolve();
    }

    public static void applySystemBars(Window window, boolean light) {
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                int appearance = light
                    ? WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                    : 0;
                controller.setSystemBarsAppearance(appearance, WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
            }
            return;
        }

        int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
        if (light && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        }
        window.getDecorView().setSystemUiVisibility(flags);
    }
}
'@
  Set-Content -LiteralPath $SystemBarsPlugin -Value $SystemBarsPluginSource -Encoding ASCII
}

function Patch-LocalNotifications($ProjectRoot) {
  $LocalNotification = Join-Path $ProjectRoot 'node_modules\@capacitor\local-notifications\android\src\main\java\com\capacitorjs\plugins\localnotifications\LocalNotification.java'
  if (-not (Test-Path -LiteralPath $LocalNotification)) {
    return
  }

  $Text = Get-Content -LiteralPath $LocalNotification -Raw
  if ($Text -notmatch 'import android\.net\.Uri;') {
    $Text = $Text -replace 'import android\.graphics\.BitmapFactory;\r?\n', "import android.graphics.BitmapFactory;`r`nimport android.net.Uri;`r`n"
  }
  if ($Text -notmatch 'import java\.io\.InputStream;') {
    $Text = $Text -replace 'import com\.getcapacitor\.plugin\.util\.AssetUtil;\r?\n', "import com.getcapacitor.plugin.util.AssetUtil;`r`nimport java.io.InputStream;`r`nimport java.net.HttpURLConnection;`r`nimport java.net.URL;`r`n"
  }
  if ($Text -notmatch 'largeIcon\.startsWith\("http://"\)') {
    $Text = $Text -replace 'public void setLargeIcon\(String largeIcon\) \{\r?\n\s*this\.largeIcon = AssetUtil\.getResourceBaseName\(largeIcon\);\r?\n\s*\}', @'
public void setLargeIcon(String largeIcon) {
        if (largeIcon != null && (largeIcon.startsWith("http://") || largeIcon.startsWith("https://") || largeIcon.startsWith("file://") || largeIcon.startsWith("content://"))) {
            this.largeIcon = largeIcon;
            return;
        }
        this.largeIcon = AssetUtil.getResourceBaseName(largeIcon);
    }
'@
  }
  if ($Text -notmatch 'HttpURLConnection connection') {
    $Text = $Text -replace 'public Bitmap getLargeIcon\(Context context\) \{\r?\n\s*if \(largeIcon != null\) \{\r?\n\s*int resId = AssetUtil\.getResourceID\(context, largeIcon, "drawable"\);', @'
public Bitmap getLargeIcon(Context context) {
        if (largeIcon != null) {
            try {
                if (largeIcon.startsWith("http://") || largeIcon.startsWith("https://")) {
                    HttpURLConnection connection = (HttpURLConnection) new URL(largeIcon).openConnection();
                    connection.setConnectTimeout(2500);
                    connection.setReadTimeout(2500);
                    try (InputStream stream = connection.getInputStream()) {
                        return BitmapFactory.decodeStream(stream);
                    } finally {
                        connection.disconnect();
                    }
                }
                if (largeIcon.startsWith("file://") || largeIcon.startsWith("content://")) {
                    try (InputStream stream = context.getContentResolver().openInputStream(Uri.parse(largeIcon))) {
                        return BitmapFactory.decodeStream(stream);
                    }
                }
            } catch (Exception ignored) {}
            int resId = AssetUtil.getResourceID(context, largeIcon, "drawable");
'@
  }

  Set-Content -LiteralPath $LocalNotification -Value $Text -Encoding ASCII
}

function Patch-NativeBackgroundRealtime($ProjectRoot) {
  $Manifest = Join-Path $ProjectRoot 'android\app\src\main\AndroidManifest.xml'
  if (Test-Path -LiteralPath $Manifest) {
    $Text = Get-Content -LiteralPath $Manifest -Raw
    foreach ($Permission in @(
      'android.permission.ACCESS_NETWORK_STATE',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.RECORD_AUDIO',
      'android.permission.MODIFY_AUDIO_SETTINGS',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.REQUEST_INSTALL_PACKAGES'
    )) {
      if ($Text -notmatch [regex]::Escape($Permission)) {
        $Text = $Text -replace '</manifest>', "    <uses-permission android:name=`"$Permission`" />`r`n</manifest>"
      }
    }
    if ($Text -notmatch 'KukeBackgroundRealtimeService') {
      $Insert = @'

        <service
            android:name=".KukeBackgroundRealtimeService"
            android:exported="false"
            android:foregroundServiceType="dataSync" />

        <receiver
            android:name=".KukeBootReceiver"
            android:enabled="true"
            android:exported="false">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.QUICKBOOT_POWERON" />
            </intent-filter>
        </receiver>
'@
      $Text = $Text -replace '\s*</application>', "$Insert`r`n    </application>"
    }
    Set-Content -LiteralPath $Manifest -Value $Text -Encoding UTF8
  }

  $Gradle = Join-Path $ProjectRoot 'android\app\build.gradle'
  if (Test-Path -LiteralPath $Gradle) {
    $GradleText = Get-Content -LiteralPath $Gradle -Raw
    if ($GradleText -notmatch 'com\.squareup\.okhttp3:okhttp') {
      $GradleText = $GradleText -replace '(implementation "androidx\.core:core-splashscreen:\$coreSplashScreenVersion")', '$1' + "`r`n    implementation `"com.squareup.okhttp3:okhttp:4.12.0`""
    }
    Set-Content -LiteralPath $Gradle -Value $GradleText -Encoding ASCII
  }

  $JavaDir = Join-Path $ProjectRoot 'android\app\src\main\java\ink\kuke\chat'
  $ServiceSource = Join-Path $ProjectRoot 'android\app\src\main\java\ink\kuke\chat\KukeBackgroundRealtimeService.java'
  $PluginSource = Join-Path $ProjectRoot 'android\app\src\main\java\ink\kuke\chat\KukeBackgroundRealtimePlugin.java'
  $BootSource = Join-Path $ProjectRoot 'android\app\src\main\java\ink\kuke\chat\KukeBootReceiver.java'
  if (-not (Test-Path -LiteralPath $JavaDir)) {
    New-Item -ItemType Directory -Path $JavaDir | Out-Null
  }
  if (-not (Test-Path -LiteralPath $ServiceSource)) {
    throw 'KukeBackgroundRealtimeService.java is missing after Capacitor sync. Restore android native sources before building.'
  }
  if (-not (Test-Path -LiteralPath $PluginSource)) {
    throw 'KukeBackgroundRealtimePlugin.java is missing after Capacitor sync. Restore android native sources before building.'
  }
  if (-not (Test-Path -LiteralPath $BootSource)) {
    throw 'KukeBootReceiver.java is missing after Capacitor sync. Restore android native sources before building.'
  }
}

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location -LiteralPath $ProjectRoot

Assert-Command 'node' 'Install Node.js 20 LTS or newer.'
Assert-Command 'npm' 'Install npm.'
Assert-Command 'java' 'Install JDK 17 and configure JAVA_HOME/PATH.'

if (-not (Test-Path -LiteralPath 'node_modules')) {
  npm install
}

Patch-LocalNotifications $ProjectRoot

npm run build:mobile-web

$MobileIndex = Join-Path $ProjectRoot 'dist-mobile\index.html'
if (-not (Test-Path -LiteralPath $MobileIndex)) {
  $MobileNamedIndex = Join-Path $ProjectRoot 'dist-mobile\index.mobile.html'
  if (Test-Path -LiteralPath $MobileNamedIndex) {
    Copy-Item -LiteralPath $MobileNamedIndex -Destination $MobileIndex -Force
  }
}

if (-not (Test-Path -LiteralPath $MobileIndex)) {
  throw 'dist-mobile\index.html was not found. Mobile web build output is invalid.'
}

$AndroidRoot = Join-Path $ProjectRoot 'android'
$CapSettings = Join-Path $AndroidRoot 'capacitor.settings.gradle'
$Gradle = Join-Path $AndroidRoot 'gradlew.bat'
if ((Test-Path -LiteralPath $AndroidRoot) -and ((-not (Test-Path -LiteralPath $CapSettings)) -or (-not (Test-Path -LiteralPath $Gradle)))) {
  Remove-Item -LiteralPath $AndroidRoot -Recurse -Force
}

if (-not (Test-Path -LiteralPath 'android')) {
  npx cap add android
} else {
  npx cap sync android
}

$GradleProperties = Join-Path $ProjectRoot 'android\gradle.properties'
if (Test-Path -LiteralPath $GradleProperties) {
  $GradlePropertiesText = Get-Content -LiteralPath $GradleProperties -Raw
  if ($GradlePropertiesText -notmatch '(?m)^android\.overridePathCheck=true$') {
    Add-Content -LiteralPath $GradleProperties -Value 'android.overridePathCheck=true'
  }
}

$AndroidManifest = Join-Path $ProjectRoot 'android\app\src\main\AndroidManifest.xml'
if (Test-Path -LiteralPath $AndroidManifest) {
  $ManifestText = Get-Content -LiteralPath $AndroidManifest -Raw
  if ($ManifestText -notmatch 'android:usesCleartextTraffic=') {
    $ManifestText = $ManifestText -replace 'android:supportsRtl="true"', 'android:supportsRtl="true"' + "`r`n        android:usesCleartextTraffic=`"true`""
  }
  if ($ManifestText -match 'android:windowSoftInputMode="[^"]+"') {
    $ManifestText = $ManifestText -replace 'android:windowSoftInputMode="[^"]+"', 'android:windowSoftInputMode="adjustNothing"'
  } else {
    $ManifestText = $ManifestText -replace 'android:launchMode="singleTask"', 'android:launchMode="singleTask"' + "`r`n            android:windowSoftInputMode=`"adjustNothing`""
  }
  foreach ($Permission in @('android.permission.RECORD_AUDIO', 'android.permission.MODIFY_AUDIO_SETTINGS')) {
    if ($ManifestText -notmatch [regex]::Escape($Permission)) {
      $ManifestText = $ManifestText -replace '</manifest>', "    <uses-permission android:name=`"$Permission`" />`r`n</manifest>"
    }
  }
  Set-Content -LiteralPath $AndroidManifest -Value $ManifestText -Encoding UTF8
}

Patch-NativeBackgroundRealtime $ProjectRoot

Patch-MainActivity $ProjectRoot

Patch-SystemBarsPlugin $ProjectRoot

Ensure-AndroidSdk $ProjectRoot

$Gradle = Join-Path $ProjectRoot 'android\gradlew.bat'
if (-not (Test-Path -LiteralPath $Gradle)) {
  throw 'android\gradlew.bat was not found. Capacitor Android project generation failed.'
}

$GradleTask = if ($Release) { 'assembleRelease' } else { 'assembleDebug' }

Push-Location -LiteralPath (Join-Path $ProjectRoot 'android')
try {
  & '.\gradlew.bat' $GradleTask
  if ($LASTEXITCODE -ne 0) {
    throw "Gradle $GradleTask failed with exit code $LASTEXITCODE."
  }
} finally {
  Pop-Location
}

if ($Release) {
  $Apk = Join-Path $ProjectRoot 'android\app\build\outputs\apk\release\app-release.apk'
  if (-not (Test-Path -LiteralPath $Apk)) {
    $UnsignedApk = Join-Path $ProjectRoot 'android\app\build\outputs\apk\release\app-release-unsigned.apk'
    if (Test-Path -LiteralPath $UnsignedApk) {
      throw 'Release APK is unsigned (app-release-unsigned.apk). Ensure android\keystore.properties and the keystore exist so the release signingConfig is applied.'
    }
    throw 'APK build finished but app-release.apk was not found.'
  }
} else {
  $Apk = Join-Path $ProjectRoot 'android\app\build\outputs\apk\debug\app-debug.apk'
  if (-not (Test-Path -LiteralPath $Apk)) {
    throw 'APK build finished but app-debug.apk was not found.'
  }
}

$LatestApk = Join-Path (Split-Path -Parent $ProjectRoot) 'KukeChat-latest.apk'
Copy-Item -LiteralPath $Apk -Destination $LatestApk -Force

"APK generated: $Apk"
"Latest APK copied: $LatestApk"
