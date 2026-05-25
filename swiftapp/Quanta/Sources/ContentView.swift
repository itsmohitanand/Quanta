import SwiftUI

struct ContentView: View {
    @EnvironmentObject var api: APIClient

    var body: some View {
        if api.isAuthenticated {
            MainTabView()
        } else {
            AuthView()
        }
    }
}
