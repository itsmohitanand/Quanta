import SwiftUI

struct AddItemView: View {
    var editing: Item? = nil

    @EnvironmentObject var api: APIClient
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var description = ""
    @State private var type = "action"
    @State private var horizon = "week"
    @State private var hasDeadline = false
    @State private var deadline = Date()
    @State private var isSaving = false

    private let types: [(String, String)] = [
        ("action", "Action"),
        ("commitment", "Commitment"),
        ("reference", "Reference"),
    ]

    private let horizons: [(String, String)] = [
        ("today",   "Today"),
        ("week",    "This Week"),
        ("month",   "This Month"),
        ("quarter", "This Quarter"),
        ("year",    "This Year"),
        ("life",    "Life"),
        ("anytime", "Anytime"),
    ]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Title", text: $title)
                    TextField("Notes", text: $description, axis: .vertical)
                        .lineLimit(3...6)
                }

                Section {
                    Picker("Type", selection: $type) {
                        ForEach(types, id: \.0) { Text($1).tag($0) }
                    }
                    Picker("Horizon", selection: $horizon) {
                        ForEach(horizons, id: \.0) { Text($1).tag($0) }
                    }
                }

                if type == "action" {
                    Section {
                        Toggle("Set Deadline", isOn: $hasDeadline.animation())
                        if hasDeadline {
                            DatePicker("Date", selection: $deadline, displayedComponents: .date)
                        }
                    }
                }
            }
            .navigationTitle(editing == nil ? "New Item" : "Edit Item")
#if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
#endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
                }
            }
        }
        .onAppear {
            guard let e = editing else { return }
            title = e.title
            description = e.description
            type = e.type
            horizon = e.horizon
            if let d = e.deadlineDate {
                hasDeadline = true
                deadline = d
            }
        }
    }

    private func save() async {
        isSaving = true
        let deadlineStr: String? = hasDeadline
            ? ISO8601DateFormatter().string(from: deadline)
            : nil

        do {
            if let e = editing {
                _ = try await api.patchItem(e.id, ItemUpdate(
                    title: title,
                    description: description,
                    horizon: horizon,
                    deadline: deadlineStr
                ))
            } else {
                _ = try await api.createItem(ItemCreate(
                    type: type,
                    title: title,
                    description: description,
                    status: "todo",
                    horizon: horizon,
                    deadline: deadlineStr
                ))
            }
            dismiss()
        } catch {}

        isSaving = false
    }
}
