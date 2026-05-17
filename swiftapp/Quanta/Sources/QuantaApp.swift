import SwiftUI

@main
struct QuantaApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .preferredColorScheme(.dark)
        }
#if os(macOS)
        .windowResizability(.contentSize)
        .defaultSize(width: 1100, height: 750)
#endif
    }
}
