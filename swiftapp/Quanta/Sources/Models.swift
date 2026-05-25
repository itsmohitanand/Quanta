import Foundation

struct Item: Identifiable, Codable, Equatable {
    let id: Int
    var type: String
    var title: String
    var description: String
    var status: String
    var horizon: String
    var deadline: String?
    var notifyWhatsapp: Int
    var parentId: Int?
    var createdAt: String?
    var completedAt: String?

    var isDone: Bool { status == "done" }
    var isSomeday: Bool { status == "someday" }

    var deadlineDate: Date? {
        guard let s = deadline else { return nil }
        for fmt in ["yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd"] {
            let f = DateFormatter()
            f.dateFormat = fmt
            if let d = f.date(from: String(s.prefix(19))) { return d }
        }
        return nil
    }

    enum CodingKeys: String, CodingKey {
        case id, type, title, description, status, horizon, deadline
        case notifyWhatsapp = "notify_whatsapp"
        case parentId = "parent_id"
        case createdAt = "created_at"
        case completedAt = "completed_at"
    }
}

struct ItemCreate: Encodable {
    var type: String
    var title: String
    var description: String
    var status: String
    var horizon: String
    var deadline: String?
}

struct ItemUpdate: Encodable {
    var title: String? = nil
    var description: String? = nil
    var status: String? = nil
    var horizon: String? = nil
    var deadline: String? = nil

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(title, forKey: .title)
        try c.encodeIfPresent(description, forKey: .description)
        try c.encodeIfPresent(status, forKey: .status)
        try c.encodeIfPresent(horizon, forKey: .horizon)
        try c.encodeIfPresent(deadline, forKey: .deadline)
    }

    enum CodingKeys: String, CodingKey {
        case title, description, status, horizon, deadline
    }
}

struct HistoryMessage: Codable {
    let role: String
    let content: String
}

struct AuthResponse: Codable {
    let token: String
}

struct ChatMessage: Identifiable, Equatable {
    let id = UUID()
    var role: String
    var content: String
    var isStreaming = false
    var tools: [ToolEvent] = []

    static func == (lhs: ChatMessage, rhs: ChatMessage) -> Bool {
        lhs.id == rhs.id && lhs.content == rhs.content && lhs.isStreaming == rhs.isStreaming
    }
}

struct ToolEvent: Identifiable, Equatable {
    let id = UUID()
    var name: String
    var result: String
}

enum SSEEvent {
    case token(String)
    case tool(String, String)
}

struct JournalTree: Decodable {
    let root: String
    let tree: [String: [String]]
}

struct ExtractResult: Decodable {
    let commitmentsAdded: Int
    let notesAdded: Int

    enum CodingKeys: String, CodingKey {
        case commitmentsAdded = "commitments_added"
        case notesAdded = "notes_added"
    }
}
