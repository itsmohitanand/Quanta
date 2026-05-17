import SwiftUI

struct LoadingView: View {
    @State private var pulse = false

    var body: some View {
        VStack(spacing: 20) {
            ZStack {
                Circle()
                    .fill(Color(hex: "#5DE4C7").opacity(0.15))
                    .frame(width: 72, height: 72)
                    .scaleEffect(pulse ? 1.2 : 1.0)
                    .animation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true), value: pulse)

                Text("Q")
                    .font(.system(size: 32, weight: .black, design: .rounded))
                    .foregroundColor(Color(hex: "#5DE4C7"))
            }
            .onAppear { pulse = true }

            Text("Quanta")
                .font(.title2).fontWeight(.bold)
                .foregroundColor(.white)

            ProgressView()
                .tint(Color(hex: "#5DE4C7"))
                .scaleEffect(0.9)

            Text("Connecting…")
                .font(.footnote)
                .foregroundColor(Color(hex: "#676E95"))
        }
    }
}
