import Foundation

@MainActor
final class APIClient: ObservableObject {
    @Published var isAuthenticated: Bool

    var token: String? {
        get { UserDefaults.standard.string(forKey: "quantaToken") }
        set {
            UserDefaults.standard.set(newValue, forKey: "quantaToken")
            isAuthenticated = newValue != nil
        }
    }

    init() {
        isAuthenticated = UserDefaults.standard.string(forKey: "quantaToken") != nil
    }

    private var base: String { Config.shared.serverURLString }

    func logout() { token = nil }

    // MARK: - Auth

    func login(username: String, password: String) async throws {
        let r: AuthResponse = try await send("/api/auth/login", body: ["username": username, "password": password])
        token = r.token
    }

    func register(username: String, password: String) async throws {
        let r: AuthResponse = try await send("/api/auth/register", body: ["username": username, "password": password])
        token = r.token
    }

    // MARK: - Items

    func fetchItems() async throws -> [Item] {
        try await fetch("/api/items")
    }

    func createItem(_ body: ItemCreate) async throws -> Item {
        try await send("/api/items", body: body)
    }

    func patchItem(_ id: Int, _ body: ItemUpdate) async throws -> Item {
        try await send("/api/items/\(id)", method: "PATCH", body: body)
    }

    func deleteItem(_ id: Int) async throws {
        let (_, _) = try await URLSession.shared.data(for: req("/api/items/\(id)", "DELETE"))
    }

    // MARK: - Journal

    func fetchJournalFiles() async throws -> JournalTree {
        try await fetch("/api/journal/files")
    }

    func readDailyJournal(date: String) async throws -> String {
        let r: [String: String] = try await fetch("/api/journal/\(date)")
        return r["content"] ?? ""
    }

    func writeDailyJournal(date: String, content: String) async throws {
        let _: [String: Bool] = try await send("/api/journal/\(date)", body: ["content": content])
    }

    func readFile(path: String) async throws -> String {
        let encoded = path.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? path
        let r: [String: String] = try await fetch("/api/journal/read?path=\(encoded)")
        return r["content"] ?? ""
    }

    func writeFile(path: String, content: String) async throws {
        let encoded = path.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? path
        let _: [String: Bool] = try await send("/api/journal/write?path=\(encoded)", body: ["content": content])
    }

    func extractJournal(date: String) async throws -> ExtractResult {
        try await send("/api/journal/\(date)/extract", body: EmptyBody())
    }

    // MARK: - Chat

    func fetchHistory() async throws -> [HistoryMessage] {
        try await fetch("/api/chat/history")
    }

    func clearHistory() async throws {
        let (_, _) = try await URLSession.shared.data(for: req("/api/chat/history", "DELETE"))
    }

    func streamChat(_ message: String) -> AsyncThrowingStream<SSEEvent, Error> {
        AsyncThrowingStream { cont in
            Task {
                var r = self.req("/api/chat", "POST")
                r.httpBody = try? JSONEncoder().encode(["message": message])
                do {
                    let (bytes, _) = try await URLSession.shared.bytes(for: r)
                    for try await line in bytes.lines {
                        guard line.hasPrefix("data: ") else { continue }
                        let payload = String(line.dropFirst(6))
                        if payload == "[DONE]" { break }
                        guard let d = payload.data(using: .utf8),
                              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any]
                        else { continue }
                        if let tok = j["token"] as? String {
                            cont.yield(.token(tok))
                        } else if let name = j["tool"] as? String, name != "__error__" {
                            let res = (j["result"] as Any?).flatMap {
                                try? JSONSerialization.data(withJSONObject: $0)
                            }.flatMap { String(data: $0, encoding: .utf8) } ?? ""
                            cont.yield(.tool(name, res))
                        }
                    }
                    cont.finish()
                } catch {
                    cont.finish(throwing: error)
                }
            }
        }
    }

    // MARK: - Helpers

    private func req(_ path: String, _ method: String) -> URLRequest {
        var r = URLRequest(url: URL(string: base + path)!)
        r.httpMethod = method
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let t = token { r.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        return r
    }

    private func fetch<T: Decodable>(_ path: String) async throws -> T {
        let (d, _) = try await URLSession.shared.data(for: req(path, "GET"))
        return try JSONDecoder().decode(T.self, from: d)
    }

    private func send<T: Decodable, B: Encodable>(_ path: String, method: String = "POST", body: B) async throws -> T {
        var r = req(path, method)
        r.httpBody = try JSONEncoder().encode(body)
        let (d, _) = try await URLSession.shared.data(for: r)
        return try JSONDecoder().decode(T.self, from: d)
    }
}

private struct EmptyBody: Encodable {}
