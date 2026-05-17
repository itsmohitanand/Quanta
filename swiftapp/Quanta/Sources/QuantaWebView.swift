import SwiftUI
import WebKit

// MARK: - Shared coordinator

final class WebViewCoordinator: NSObject, WKNavigationDelegate {
    var onFinish: () -> Void
    var onError: (Error) -> Void

    init(onFinish: @escaping () -> Void, onError: @escaping (Error) -> Void) {
        self.onFinish = onFinish
        self.onError  = onError
    }

    func webView(_ webView: WKWebView, didFinish _: WKNavigation!) { onFinish() }
    func webView(_ webView: WKWebView, didFail _: WKNavigation!, withError e: Error) { onError(e) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation _: WKNavigation!, withError e: Error) { onError(e) }
}

// MARK: - iOS

#if os(iOS)
import UIKit

struct QuantaWebView: UIViewRepresentable {
    let url: URL
    var onFinish: () -> Void
    var onError:  (Error) -> Void

    func makeCoordinator() -> WebViewCoordinator {
        WebViewCoordinator(onFinish: onFinish, onError: onError)
    }

    func makeUIView(context: Context) -> WKWebView {
        let wv = makeWebView()
        wv.navigationDelegate = context.coordinator
        wv.load(URLRequest(url: url, timeoutInterval: 10))
        return wv
    }

    func updateUIView(_ wv: WKWebView, context: Context) {}
}

// MARK: - macOS

#else
import AppKit

struct QuantaWebView: NSViewRepresentable {
    let url: URL
    var onFinish: () -> Void
    var onError:  (Error) -> Void

    func makeCoordinator() -> WebViewCoordinator {
        WebViewCoordinator(onFinish: onFinish, onError: onError)
    }

    func makeNSView(context: Context) -> WKWebView {
        let wv = makeWebView()
        wv.navigationDelegate = context.coordinator
        wv.load(URLRequest(url: url, timeoutInterval: 10))
        return wv
    }

    func updateNSView(_ wv: WKWebView, context: Context) {}
}
#endif

// MARK: - Shared factory

private func makeWebView() -> WKWebView {
    let cfg = WKWebViewConfiguration()
    cfg.allowsInlineMediaPlayback = true
    cfg.mediaTypesRequiringUserActionForPlayback = []
    let prefs = WKWebpagePreferences()
    prefs.allowsContentJavaScript = true
    cfg.defaultWebpagePreferences = prefs

    let wv = WKWebView(frame: .zero, configuration: cfg)
    wv.allowsBackForwardNavigationGestures = false
    wv.isOpaque = false
    wv.backgroundColor = .clear
    return wv
}
