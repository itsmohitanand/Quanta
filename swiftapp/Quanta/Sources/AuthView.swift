import SwiftUI

struct AuthView: View {
    @EnvironmentObject var api: APIClient

    @State private var username = ""
    @State private var password = ""
    @State private var isRegistering = false
    @State private var isLoading = false
    @State private var errorMsg: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Username", text: $username)
#if os(iOS)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
#endif
                    SecureField("Password", text: $password)
                }

                Section {
                    Button(isRegistering ? "Create Account" : "Sign In") {
                        Task { await submit() }
                    }
                    .disabled(username.isEmpty || password.isEmpty || isLoading)
                }

                if let msg = errorMsg {
                    Section {
                        Text(msg)
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }
            }
            .navigationTitle(isRegistering ? "Create Account" : "Sign In")
            .toolbar {
                // Use a cross-platform placement to avoid splitting trailing closures across compiler directives
                ToolbarItem(placement: .primaryAction) {
                    Button(isRegistering ? "Sign In" : "Register") {
                        isRegistering.toggle()
                        errorMsg = nil
                    }
                }
            }
            .overlay {
                if isLoading { ProgressView() }
            }
        }
    }

    private func submit() async {
        isLoading = true
        errorMsg = nil
        do {
            if isRegistering {
                try await api.register(username: username, password: password)
            } else {
                try await api.login(username: username, password: password)
            }
        } catch {
            errorMsg = error.localizedDescription
        }
        isLoading = false
    }
}

