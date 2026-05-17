import SwiftUI

struct ContentView: View {
    @StateObject private var config = Config.shared
    @State private var phase: Phase = .loading

    enum Phase { case loading, ready, error(String) }

    var body: some View {
        ZStack {
            Color(hex: "#1B1E28").ignoresSafeArea()

            switch phase {
            case .loading:
                LoadingView()
                    .transition(.opacity)

            case .ready:
                QuantaWebView(
                    url: config.serverURL,
                    onFinish: { withAnimation { phase = .ready } },
                    onError:  { e in withAnimation { phase = .error(e.localizedDescription) } }
                )
                .ignoresSafeArea()
                .transition(.opacity)

            case .error(let msg):
                OfflineView(message: msg) {
                    phase = .loading
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        phase = .ready
                    }
                }
                .transition(.opacity)
            }
        }
        .onAppear {
            // Short delay so the loading screen is visible
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                phase = .ready
            }
        }
    }
}
