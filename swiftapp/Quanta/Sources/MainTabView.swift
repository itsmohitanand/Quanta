import SwiftUI

struct MainTabView: View {
    var body: some View {
        TabView {
            JournalView()
                .tabItem { Label("Journal", systemImage: "book.pages") }

            ItemsView()
                .tabItem { Label("Items", systemImage: "checklist") }

            ChatView()
                .tabItem { Label("Chat", systemImage: "bubble.left.and.bubble.right") }
        }
    }
}
