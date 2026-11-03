import SwiftUI

/// Shared layout for choosing what to send or how to receive, before a transfer starts.
struct EntryPanel<Content: View>: View {
    let symbol: String
    let tint: Color
    let title: String
    let switchLabel: String
    let onSwitch: () -> Void
    @ViewBuilder let content: () -> Content

    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 12) {
                        IconTile(symbol: symbol, tint: tint, size: 44)
                        Text(title).font(.system(size: 22, weight: .semibold)).foregroundStyle(Theme.text)
                    }
                    .accessibilityElement(children: .combine)
                    GeometryReader { area in
                        ScrollView {
                            content().frame(maxWidth: .infinity, minHeight: area.size.height)
                        }
                        .scrollDismissesKeyboard(.interactively)
                        .scrollIndicators(.hidden)
                    }
                    .padding(.top, 24)
                    Rectangle().fill(Theme.line).frame(height: 1).padding(.top, 24)
                    Button(action: onSwitch) {
                        HStack(spacing: 6) {
                            Text(switchLabel)
                            Image(systemName: "arrow.right")
                        }
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.muted)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 8)
                }
                .padding(24)
                .frame(maxWidth: 420, minHeight: 520, maxHeight: 520)
                .background(RoundedRectangle(cornerRadius: 24).fill(Theme.bg2))
                .overlay(RoundedRectangle(cornerRadius: 24).stroke(Theme.line, lineWidth: 1))
                .padding(.horizontal, 20)
                .padding(.vertical, 64)
                .frame(maxWidth: .infinity, minHeight: geometry.size.height)
            }
            .scrollDismissesKeyboard(.interactively)
            .scrollIndicators(.hidden)
        }
        .background(Theme.bg.ignoresSafeArea())
    }
}
