import SwiftUI

struct ItemsView: View {
    @EnvironmentObject var api: APIClient

    @State private var items: [Item] = []
    @State private var showAdd = false
    @State private var editItem: Item?
    @State private var filter: ItemFilter = .active

    enum ItemFilter: String, CaseIterable {
        case active = "Active"
        case all = "All"
        case done = "Done"
    }

    var commitments: [Item] {
        items
            .filter { $0.type == "commitment" && visible($0) }
            .sorted { $0.id > $1.id }
    }

    var actions: [Item] {
        items
            .filter { $0.type == "action" && visible($0) }
            .sorted {
                switch ($0.deadlineDate, $1.deadlineDate) {
                case let (l?, r?): return l < r
                case (_?, nil): return true
                default: return $0.id > $1.id
                }
            }
    }

    var body: some View {
        NavigationStack {
            List {
                if !commitments.isEmpty {
                    Section("Commitments") {
                        ForEach(commitments) { item in
                            ItemRow(item: item, onToggle: { Task { await toggle(item) } })
                                .contentShape(Rectangle())
                                .onTapGesture { editItem = item }
                                .swipeActions(edge: .leading) {
                                    doneButton(item)
                                }
                                .swipeActions(edge: .trailing) {
                                    deleteButton(item)
                                }
                        }
                    }
                }

                if !actions.isEmpty {
                    Section("Actions") {
                        ForEach(actions) { item in
                            ItemRow(item: item, onToggle: { Task { await toggle(item) } })
                                .contentShape(Rectangle())
                                .onTapGesture { editItem = item }
                                .swipeActions(edge: .leading) {
                                    doneButton(item)
                                }
                                .swipeActions(edge: .trailing) {
                                    deleteButton(item)
                                }
                        }
                    }
                }

                if actions.isEmpty && commitments.isEmpty {
                    Section {
                        HStack {
                            Spacer()
                            VStack(spacing: 8) {
                                Image(systemName: "tray")
                                    .font(.largeTitle)
                                    .foregroundStyle(.tertiary)
                                Text(filter == .active ? "Nothing active" : "No items")
                                    .foregroundStyle(.secondary)
                            }
                            .padding(.vertical, 24)
                            Spacer()
                        }
                    }
                    .listRowBackground(Color.clear)
                }
            }
#if os(iOS)
            .listStyle(.insetGrouped)
#endif
            .navigationTitle("Quanta")
            .toolbar {
                ToolbarItem(placement: .navigation) {
                    Menu {
                        ForEach(ItemFilter.allCases, id: \.self) { f in
                            Button {
                                filter = f
                            } label: {
                                if filter == f {
                                    Label(f.rawValue, systemImage: "checkmark")
                                } else {
                                    Text(f.rawValue)
                                }
                            }
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Text(filter.rawValue)
                                .font(.subheadline)
                            Image(systemName: "chevron.down")
                                .font(.caption2)
                        }
                    }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button { showAdd = true } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .task { await load() }
            .refreshable { await load() }
            .sheet(isPresented: $showAdd) {
                AddItemView()
                    .onDisappear { Task { await load() } }
            }
            .sheet(item: $editItem) { item in
                AddItemView(editing: item)
                    .onDisappear { Task { await load() } }
            }
        }
    }

    @ViewBuilder
    private func doneButton(_ item: Item) -> some View {
        Button {
            Task { await toggle(item) }
        } label: {
            Label(item.isDone ? "Reopen" : "Done",
                  systemImage: item.isDone ? "arrow.uturn.backward" : "checkmark")
        }
        .tint(item.isDone ? .orange : .green)
    }

    @ViewBuilder
    private func deleteButton(_ item: Item) -> some View {
        Button(role: .destructive) {
            Task { await delete(item) }
        } label: {
            Label("Delete", systemImage: "trash")
        }
    }

    private func visible(_ item: Item) -> Bool {
        switch filter {
        case .active: return !item.isDone && !item.isSomeday
        case .done:   return item.isDone
        case .all:    return true
        }
    }

    private func load() async {
        do { items = try await api.fetchItems() } catch {}
    }

    private func toggle(_ item: Item) async {
        let newStatus = item.isDone ? "todo" : "done"
        do {
            let updated = try await api.patchItem(item.id, ItemUpdate(status: newStatus))
            if let idx = items.firstIndex(where: { $0.id == item.id }) {
                items[idx] = updated
            }
        } catch {}
    }

    private func delete(_ item: Item) async {
        do {
            try await api.deleteItem(item.id)
            items.removeAll { $0.id == item.id }
        } catch {}
    }
}

struct ItemRow: View {
    let item: Item
    let onToggle: () -> Void

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MMM d"
        return f
    }()

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onToggle) {
                Image(systemName: item.isDone ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(item.isDone ? .green : .secondary)
                    .font(.title3)
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 3) {
                Text(item.title)
                    .strikethrough(item.isDone)
                    .foregroundStyle(item.isDone ? .secondary : .primary)

                HStack(spacing: 6) {
                    if let d = item.deadlineDate {
                        let overdue = d < Date() && !item.isDone
                        Label(Self.dateFormatter.string(from: d), systemImage: "calendar")
                            .font(.caption)
                            .foregroundStyle(overdue ? .red : .secondary)
                    }
                    HorizonBadge(horizon: item.horizon)
                }
            }

            Spacer(minLength: 0)
        }
        .padding(.vertical, 2)
    }
}

struct HorizonBadge: View {
    let horizon: String

    private var label: String {
        switch horizon {
        case "today":   return "Today"
        case "week":    return "Week"
        case "month":   return "Month"
        case "quarter": return "Q"
        case "year":    return "Year"
        case "life":    return "Life"
        case "anytime": return "Anytime"
        default:        return horizon.capitalized
        }
    }

    var body: some View {
        Text(label)
            .font(.caption2.weight(.medium))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(.secondary.opacity(0.15), in: Capsule())
            .foregroundStyle(.secondary)
    }
}
