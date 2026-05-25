import SwiftUI

struct JournalView: View {
    @EnvironmentObject var api: APIClient

    @State private var date = Date()
    @State private var content = ""
    @State private var currentPath: String? = nil   // nil → daily entry for `date`
    @State private var displayName = ""
    @State private var isLoading = false
    @State private var isExtracting = false
    @State private var extractMessage: String? = nil
    @State private var showDatePicker = false
    @State private var showBrowser = false
    @State private var saveTask: Task<Void, Never>? = nil

    private static let dateFmt: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; return f
    }()

    private static let displayFmt: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "d MMM yyyy"; return f
    }()

    private var dateString: String { Self.dateFmt.string(from: date) }

    var body: some View {
        NavigationStack {
            ZStack {
                TextEditor(text: $content)
                    .font(.body)
                    .lineSpacing(4)
                    .padding(.horizontal, 4)
                    .disabled(isLoading)
                    .onChange(of: content) { _ in scheduleSave() }

                if isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(.ultraThinMaterial)
                }
            }
            .navigationTitle(displayName)
#if os(iOS)
            .navigationBarTitleDisplayMode(.inline) // ✅ FIX 1: Restrict to iOS
#endif
            .toolbar {
                ToolbarItem(placement: .navigation) {
                    HStack(spacing: 2) {
                        Button { shift(-1) } label: { Image(systemName: "chevron.left") }
                        Button { date = Date(); currentPath = nil } label: {
                            Text("Today").font(.subheadline)
                        }
                        Button { shift(1) } label: { Image(systemName: "chevron.right") }
                            .disabled(Calendar.current.isDateInToday(date) || date > Date())
                    }
                }
                
                ToolbarItem(placement: .primaryAction) {
                    HStack(spacing: 14) {
                        Button { showDatePicker = true } label: { Image(systemName: "calendar") }
                        Button { showBrowser = true } label: { Image(systemName: "folder") }
                        Button { Task { await extract() } } label: {
                            Image(systemName: "wand.and.stars")
                                .opacity(isExtracting ? 0 : 1)
                                .overlay { ProgressView().scaleEffect(0.75).opacity(isExtracting ? 1 : 0) }
                        }
                        .disabled(isExtracting || currentPath != nil || content.isEmpty)
                    }
                }
            }
            .task { await loadForDate(date) }
            .onChange(of: date) { _ in
                currentPath = nil
                Task { await loadForDate(date) }
            }
            .sheet(isPresented: $showDatePicker) {
                DatePickerSheet(date: $date)
                    .onDisappear { showDatePicker = false }
            }
            .sheet(isPresented: $showBrowser) {
                FileTreeView { path, name in
                    currentPath = path
                    displayName = name
                    showBrowser = false
                    Task { await loadFile(path) }
                }
            }
            // ✅ FIX 2: Use a mutable Binding instead of a .constant to avoid runtime warnings
            .alert("Extract", isPresented: Binding(
                get: { extractMessage != nil },
                set: { isPresented in if !isPresented { extractMessage = nil } }
            )) {
                Button("OK") { extractMessage = nil }
            } message: {
                Text(extractMessage ?? "")
            }
        }
    }

    // MARK: - Navigation

    private func shift(_ days: Int) {
        guard let next = Calendar.current.date(byAdding: .day, value: days, to: date) else { return }
        if days > 0 && next > Date() { return }
        date = next
    }

    // MARK: - Load / Save

    private func loadForDate(_ d: Date) async {
        displayName = Self.displayFmt.string(from: d)
        isLoading = true
        do {
            content = try await api.readDailyJournal(date: Self.dateFmt.string(from: d))
        } catch {
            content = ""
        }
        isLoading = false
    }

    private func loadFile(_ path: String) async {
        isLoading = true
        do {
            content = try await api.readFile(path: path)
        } catch {
            content = ""
        }
        isLoading = false
    }

    private func scheduleSave() {
        saveTask?.cancel()
        saveTask = Task {
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            guard !Task.isCancelled else { return }
            await save()
        }
    }

    private func save() async {
        do {
            if let path = currentPath {
                try await api.writeFile(path: path, content: content)
            } else {
                try await api.writeDailyJournal(date: dateString, content: content)
            }
        } catch {}
    }

    // MARK: - Extract

    private func extract() async {
        isExtracting = true
        do {
            let r = try await api.extractJournal(date: dateString)
            extractMessage = "\(r.commitmentsAdded) commitment\(r.commitmentsAdded == 1 ? "" : "s") and \(r.notesAdded) note\(r.notesAdded == 1 ? "" : "s") added."
        } catch {
            extractMessage = "Extract failed. Is Ollama running?"
        }
        isExtracting = false
    }
}

// MARK: - Date Picker Sheet

struct DatePickerSheet: View {
    @Binding var date: Date
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            DatePicker("", selection: $date, in: ...Date(), displayedComponents: .date)
                .datePickerStyle(.graphical)
                .padding()
                .navigationTitle("Pick a Date")
#if os(iOS)
                .navigationBarTitleDisplayMode(.inline) // ✅ FIX 1: Restrict to iOS
#endif
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { dismiss() }
                    }
                }
        }
        .presentationDetents([.medium])
    }
}
