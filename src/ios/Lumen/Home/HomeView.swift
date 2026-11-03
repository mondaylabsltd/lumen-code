import SwiftUI

/// The home screen: brand, headline and the two actions.
struct HomeView: View {
    @Environment(AppModel.self) private var model
    let view: ViewModel

    var body: some View {
        GeometryReader { geometry in
            let wide = geometry.size.width > geometry.size.height
            let compact = geometry.size.height < 520
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    HStack(spacing: 10) {
                        BrandMark()
                        Text("Lumen Code").font(.system(size: 16, weight: .semibold)).foregroundStyle(Theme.text)
                    }
                    Spacer()
                    Button { model.dispatch(Ev.toggleLang) } label: {
                        Text("中 / EN")
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.muted)
                            .padding(.horizontal, 10).padding(.vertical, 5)
                            .overlay(RoundedRectangle(cornerRadius: 9).stroke(Theme.line, lineWidth: 1))
                            .frame(minWidth: 44, minHeight: 44) // the target, around the small chip
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("中文 / English")
                }
                .padding(.top, 8)

                VStack(alignment: .leading, spacing: 2) {
                    Text(model.t("heroA")).foregroundStyle(Theme.text)
                    Text(model.t("heroB")).foregroundStyle(Theme.heroGradient)
                }
                .font(.system(size: compact ? 26 : 36, weight: .bold))
                .tracking(-0.3)
                .padding(.top, compact ? 16 : 32)
                .padding(.bottom, 24)

                let layout = wide
                    ? AnyLayout(HStackLayout(spacing: 14))
                    : AnyLayout(VStackLayout(spacing: 14))
                layout { cards }
                    .frame(maxHeight: .infinity)

                Text(model.t("foot"))
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.faint)
                    .padding(.top, 20)
                // the version, for reports: app version and the commit of the sources
                Text("\(model.t("buildLabel")) \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "") · \(model.view?.build ?? "")")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(Theme.faint)
                    .textSelection(.enabled)
                    .padding(.top, 6)
                    .padding(.bottom, 12)
            }
            .padding(.horizontal, 20)
            .frame(maxWidth: 980, maxHeight: .infinity)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    @ViewBuilder private var cards: some View {
        ChoiceCard(symbol: "arrow.up.square", tint: Theme.cyan, title: model.t("sendTitle")) {
            model.dispatch(Ev.navigate(.send))
        }
        ChoiceCard(symbol: "viewfinder", tint: Theme.pink, title: model.t("recvTitle")) {
            model.dispatch(Ev.navigate(.receive))
        }
    }

}

private struct ChoiceCard: View {
    let symbol: String
    let tint: Color
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 16) {
                IconTile(symbol: symbol, tint: tint, size: 46)
                Text(title).font(.system(size: 20, weight: .semibold)).foregroundStyle(Theme.text)
            }
            .padding(22)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(LinearGradient(colors: [Color.white.opacity(0.05), Color.white.opacity(0.02)], startPoint: .top, endPoint: .bottom))
            )
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Theme.line, lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: 20))
        }
        .buttonStyle(CardPress())
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct CardPress: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.spring(duration: 0.2), value: configuration.isPressed)
    }
}
