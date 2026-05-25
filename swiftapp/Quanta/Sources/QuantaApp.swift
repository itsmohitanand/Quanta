import SwiftUI

@main
struct QuantaApp: App {
    @StateObject private var api = APIClient()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(api)
        }
#if os(macOS)
        .windowResizability(.contentSize)
        .defaultSize(width: 1100, height: 750)
#endif
    }
}
