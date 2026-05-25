import SwiftUI

struct ChatView: View {
    @EnvironmentObject var api: APIClient

    @State private var messages: [ChatMessage] = []
    @State private var input = ""
    @State private var isStreaming = false
    @State private var scrollTick = 0  // incremented to trigger auto-scroll

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 2) {
                            ForEach(messages) { msg in
                                MessageBubble(message: msg)
                                    .padding(.horizontal)
                                    .padding(.vertical, 3)
                            }
                            Color.clear.frame(height: 1).id("bottom")
                        }
                        .padding(.vertical, 8)
                    }
                    .onChange(of: scrollTick) { _ in
                        proxy.scrollTo("bottom", anchor: .bottom)
                    }
                }

                Divider()

                HStack(alignment: .bottom, spacing: 10) {
                    TextField("Message…", text: $input, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .lineLimit(1...5)
                        .disabled(isStreaming)

                    Button {
                        Task { await send() }
                    } label: {
                        Image(systemName: isStreaming ? "stop.circle.fill" : "arrow.up.circle.fill")
                            .font(.title2)
                            .foregroundStyle(input.trimmingCharacters(in: .whitespaces).isEmpty && !isStreaming
                                ? AnyShapeStyle(.secondary) : AnyShapeStyle(Color.accentColor))
                    }
                    .disabled(input.trimmingCharacters(in: .whitespaces).isEmpty && !isStreaming)
                }
                .padding(.horizontal)
                .padding(.vertical, 10)
            }
            .navigationTitle("Chat")
#if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
#endif
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        Task { await clearHistory() }
                    } label: {
                        Image(systemName: "trash")
                    }
                    .disabled(messages.isEmpty || isStreaming)
                }
            }
            .task { await loadHistory() }
        }
    }

    private func loadHistory() async {
        do {
            let history = try await api.fetchHistory()
            messages = history.map { ChatMessage(role: $0.role, content: $0.content) }
            scrollTick += 1
        } catch {}
    }

    private func send() async {
        let text = input.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        input = ""

        messages.append(ChatMessage(role: "user", content: text))
        messages.append(ChatMessage(role: "assistant", content: "", isStreaming: true))
        let idx = messages.count - 1
        isStreaming = true
        scrollTick += 1

        do {
            for try await event in api.streamChat(text) {
                switch event {
                case .token(let tok):
                    messages[idx].content += tok
                    scrollTick += 1
                case .tool(let name, let result):
                    messages[idx].tools.append(ToolEvent(name: name, result: result))
                    scrollTick += 1
                }
            }
        } catch {}

        messages[idx].isStreaming = false
        isStreaming = false
    }

    private func clearHistory() async {
        do {
            try await api.clearHistory()
            messages = []
        } catch {}
    }
}

struct MessageBubble: View {
    let message: ChatMessage

    private var isUser: Bool { message.role == "user" }

    var body: some View {
        VStack(alignment: isUser ? .trailing : .leading, spacing: 4) {
            if !message.tools.isEmpty {
                ForEach(message.tools) { tool in
                    ToolPill(event: tool)
                }
            }

            HStack(alignment: .bottom, spacing: 0) {
                if isUser { Spacer(minLength: 60) }

                Group {
                    if message.isStreaming && message.content.isEmpty {
                        TypingIndicator()
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                    } else {
                        Text(message.content)
                            .textSelection(.enabled)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                    }
                }
#if os(iOS)
                .background(isUser ? Color.accentColor : Color(UIColor.systemGray5))
#else
                .background(isUser ? Color.accentColor : Color.secondary.opacity(0.2))
#endif
                .foregroundStyle(isUser ? .white : .primary)
                .clipShape(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                )

                if !isUser { Spacer(minLength: 60) }
            }
        }
        .frame(maxWidth: .infinity, alignment: isUser ? .trailing : .leading)
    }
}

struct TypingIndicator: View {
    @State private var phase = 0

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .fill(.secondary)
                    .frame(width: 7, height: 7)
                    .scaleEffect(phase == i ? 1.3 : 0.9)
                    .animation(
                        .easeInOut(duration: 0.4).repeatForever().delay(Double(i) * 0.15),
                        value: phase
                    )
            }
        }
        .onAppear { phase = 0 }
    }
}

struct ToolPill: View {
    let event: ToolEvent
    @State private var expanded = false

    var body: some View {
        Button {
            withAnimation(.spring(response: 0.25)) { expanded.toggle() }
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 5) {
                    Image(systemName: "wrench.and.screwdriver")
                        .font(.caption2)
                    Text(event.name)
                        .font(.caption.bold())
                    Spacer()
                    Image(systemName: expanded ? "chevron.up" : "chevron.down")
                        .font(.caption2)
                }
                if expanded {
                    Text(event.result)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(10)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .foregroundStyle(.secondary)
        }
        .buttonStyle(.plain)
    }
}

