package com.chess960.app

import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewAssetLoader.AssetsPathHandler

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        setContentView(webView)

        val assetLoader =
            WebViewAssetLoader.Builder()
                .addPathHandler("/", AssetsPathHandler(this))
                .build()

        webView.webViewClient =
            object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest,
                ): WebResourceResponse? {
                    val response = assetLoader.shouldInterceptRequest(request.url)

                    // Fix WASM MIME type — Android doesn't know application/wasm
                    if (response != null &&
                        request.url.lastPathSegment?.endsWith(".wasm") == true
                    ) {
                        return WebResourceResponse(
                            "application/wasm",
                            response.encoding,
                            response.data,
                        )
                    }
                    return response
                }
            }

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            cacheMode = WebSettings.LOAD_NO_CACHE
        }

        webView.loadUrl("https://appassets.androidplatform.net/index.html")
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
