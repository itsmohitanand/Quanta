import Foundation
import Combine

final class Config: ObservableObject {
    static let shared = Config()

    @Published var serverURLString: String {
        didSet { UserDefaults.standard.set(serverURLString, forKey: "quantaServerURL") }
    }

    var serverURL: URL {
        URL(string: serverURLString) ?? fallback
    }

    private let fallback = URL(string: "http://100.127.34.44:8000")!

    private init() {
        self.serverURLString = UserDefaults.standard.string(forKey: "quantaServerURL")
            ?? "http://100.127.34.44:8000"
    }
}
