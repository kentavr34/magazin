package com.kentavr.magazin;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/**
 * Оболочка вокруг игры.
 *
 * Игра живёт на сервере и обновляется сама: приложение всегда открывает
 * один и тот же адрес, а свежесть файлов держит service worker внутри
 * страницы. Поэтому новая версия игры НЕ требует переустановки apk —
 * достаточно выложить её на сервер.
 *
 * Первый запуск нужен с интернетом: в этот момент игра скачивается
 * в кэш. Дальше запускается и без сети.
 */
public class MainActivity extends Activity {

    private static final String GAME_URL = "https://magazin.45-67-216-36.sslip.io/";
    private static final String HOST = "magazin.45-67-216-36.sslip.io";

    private WebView web;
    private View offlineView;
    private long lastBackPress = 0L;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setBackgroundDrawableResource(R.color.bg);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#08080A"));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#08080A"));
        web.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);            // localStorage: настройки качества и прогресс
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setSupportZoom(false);
        s.setTextZoom(100);                      // системный размер шрифта не должен ломать вёрстку
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMediaPlaybackRequiresUserGesture(false);   // звук игры без лишнего тапа
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            s.setSafeBrowsingEnabled(false);     // ходим только на свой адрес
        }

        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                Uri u = req.getUrl();
                // Свой сайт открываем внутри, чужие ссылки — в браузере,
                // чтобы приложение не превратилось в браузер.
                if (u.getHost() != null && u.getHost().equals(HOST)) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception ignored) { }
                return true;
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest req,
                                        android.webkit.WebResourceError err) {
                // Ругаемся только на саму страницу игры, а не на каждую картинку.
                if (req.isForMainFrame() && !hasNetwork()) showOffline();
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                hideOffline();
                hideBars();
            }
        });

        root.addView(web);
        root.addView(buildOfflineView());
        setContentView(root);

        hideBars();

        if (saved != null) web.restoreState(saved);
        else web.loadUrl(GAME_URL);
    }

    /* ---------- экран «нет интернета» ---------- */
    private View buildOfflineView() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setBackgroundColor(Color.parseColor("#08080A"));
        box.setPadding(48, 48, 48, 48);
        box.setVisibility(View.GONE);

        TextView t = new TextView(this);
        t.setText(R.string.offline_title);
        t.setTextColor(Color.parseColor("#C9A227"));
        t.setTextSize(20);
        t.setGravity(Gravity.CENTER);

        TextView d = new TextView(this);
        d.setText(R.string.offline_text);
        d.setTextColor(Color.parseColor("#8A8578"));
        d.setTextSize(14);
        d.setGravity(Gravity.CENTER);
        d.setPadding(0, 24, 0, 32);

        Button b = new Button(this);
        b.setText(R.string.retry);
        b.setTextColor(Color.parseColor("#101014"));
        b.setBackgroundColor(Color.parseColor("#C9A227"));
        b.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                hideOffline();
                web.loadUrl(GAME_URL);
            }
        });

        box.addView(t);
        box.addView(d);
        box.addView(b);
        box.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        offlineView = box;
        return box;
    }

    private void showOffline() { if (offlineView != null) offlineView.setVisibility(View.VISIBLE); }
    private void hideOffline() { if (offlineView != null) offlineView.setVisibility(View.GONE); }

    private boolean hasNetwork() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            NetworkInfo ni = cm.getActiveNetworkInfo();
            return ni != null && ni.isConnected();
        } catch (Exception e) { return false; }
    }

    /* ---------- полный экран без полосок ---------- */
    private void hideBars() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                getWindow().setDecorFitsSystemWindows(false);
                WindowInsetsController c = getWindow().getInsetsController();
                if (c != null) {
                    c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                    c.setSystemBarsBehavior(
                            WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                }
            } else {
                getWindow().getDecorView().setSystemUiVisibility(
                        View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                                | View.SYSTEM_UI_FLAG_FULLSCREEN
                                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
            }
        } catch (Exception ignored) { }
    }

    @Override
    public void onWindowFocusChanged(boolean has) {
        super.onWindowFocusChanged(has);
        if (has) hideBars();
    }

    /* ---------- кнопка «назад» ---------- */
    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) { web.goBack(); return; }
        // Случайное касание «назад» посреди игры не должно её закрывать.
        long now = System.currentTimeMillis();
        if (now - lastBackPress < 2000) { super.onBackPressed(); return; }
        lastBackPress = now;
        Toast.makeText(this, R.string.exit_hint, Toast.LENGTH_SHORT).show();
    }

    @Override protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (web != null) web.saveState(out);
    }

    @Override protected void onPause()  { super.onPause();  if (web != null) web.onPause();  }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); hideBars(); }

    @Override protected void onDestroy() {
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}
