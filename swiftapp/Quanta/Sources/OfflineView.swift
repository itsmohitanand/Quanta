import SwiftUI

struct OfflineView: View {
    let message: String
    let onRetry: () -> Void

    @StateObject private var config = Config.shared
    @State private var editingURL = false
    @State private var draft = ""

    var body: some View {
        VStack(spacing: 28) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 52))
                .foregroundColor(Color(hex: "#D0679D"))

            VStack(spacing: 8) {
                Text("Can't reach Quanta")
                    .font(.title2).fontWeight(.semibold)
                    .foregroundColor(.white)

                Text(config.serverURLString)
                    .font(.caption)
                    .foregroundColor(Color(hex: "#676E95"))
                    .lineLimit(1)
                    .truncationMode(.middle)
            }

            if editingURL {
                VStack(spacing: 8) {
                    TextField("http://...", text: $draft)
                        .textFieldStyle(.roundedBorder)
#if os(iOS)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
#endif
                    HStack {
                        Button("Cancel") { editingURL = false }
                            .foregroundColor(Color(hex: "#676E95"))
                        Spacer()
                        Button("Save & Connect") {
                            config.serverURLString = draft
                            editingURL = false
                            onRetry()
                        }
                        .fontWeight(.semibold)
                        .foregroundColor(Color(hex: "#5DE4C7"))
                    }
                }
                .padding(.horizontal, 8)
            }

            HStack(spacing: 12) {
                Button(action: onRetry) {
                    Label("Try Again", systemImage: "arrow.clockwise")
                }
                .buttonStyle(.borderedProminent)
                .tint(Color(hex: "#5DE4C7"))
                .foregroundColor(Color(hex: "#171922"))

                if !editingURL {
                    Button("Change URL") {
                        draft = config.serverURLString
                        editingURL = true
                    }
                    .buttonStyle(.bordered)
                    .foregroundColor(Color(hex: "#A6ACCD"))
                }
            }
        }
        .padding(36)
        .frame(maxWidth: 360)
    }
}
