import SwiftUI

struct FileTreeView: View {
    let onSelect: (String, String) -> Void

    @EnvironmentObject var api: APIClient
    @Environment(\.dismiss) private var dismiss

    @State private var tree: [String: [String]] = [:]
    @State private var expanded: Set<String> = []
    @State private var isLoading = true

    private var folders: [String] { tree.keys.sorted() }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Loading…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if tree.isEmpty {
                    ContentUnavailableView("No Files", systemImage: "folder")
                } else {
                    List {
                        ForEach(folders, id: \.self) { folder in
                            Section {
                                if expanded.contains(folder) {
                                    let files = tree[folder] ?? []
                                    if files.isEmpty {
                                        Text("Empty")
                                            .foregroundStyle(.tertiary)
                                            .font(.subheadline)
                                    } else {
                                        ForEach(files, id: \.self) { file in
                                            Button {
                                                onSelect("\(folder)/\(file)", file)
                                            } label: {
                                                Label(file, systemImage: fileIcon(file))
                                                    .foregroundStyle(.primary)
                                            }
                                        }
                                    }
                                }
                            } header: {
                                Button {
                                    withAnimation(.easeInOut(duration: 0.2)) {
                                        if expanded.contains(folder) {
                                            expanded.remove(folder)
                                        } else {
                                            expanded.insert(folder)
                                        }
                                    }
                                } label: {
                                    HStack {
                                        Image(systemName: expanded.contains(folder)
                                            ? "folder.fill" : "folder")
                                            .foregroundStyle(Color.accentColor)
                                        Text(folder)
                                            .font(.subheadline.weight(.semibold))
                                            .textCase(nil)
                                            .foregroundStyle(.primary)
                                        Spacer()
                                        Image(systemName: expanded.contains(folder)
                                            ? "chevron.down" : "chevron.right")
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    // ✅ FIX 1: Restrict insetGrouped to iOS
#if os(iOS)
                    .listStyle(.insetGrouped)
#endif
                }
            }
            .navigationTitle("Files")
            // ✅ FIX 2: Restrict navigationBarTitleDisplayMode to iOS
#if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
#endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .task { await load() }
        }
    }

    private func load() async {
        isLoading = true
        do {
            let result = try await api.fetchJournalFiles()
            tree = result.tree
            expanded = ["daily"]
        } catch {}
        isLoading = false
    }

    private func fileIcon(_ name: String) -> String {
        if name.hasSuffix(".typ") { return "doc.text" }
        if name.hasSuffix(".md")  { return "doc.richtext" }
        return "doc"
    }
}
