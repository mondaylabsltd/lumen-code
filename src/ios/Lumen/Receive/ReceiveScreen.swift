import CoreMotion
import SwiftUI
import UIKit

/// The receiver (the web's recv page): start screen, live camera with a small panel, result.
/// While scanning, nothing covers the middle of the picture: the back button and status at
/// the top, the panel (and the camera tools just above it) at the bottom, and corner guides
/// between them until a code is found.
struct ReceiveScreen: View {
    @Environment(AppModel.self) private var model
    let view: ViewModel
    /// How the phone is held, for the panel over the live picture.
    @State private var tilt = Tilt()

    var body: some View {
        let r = view.recv
        ZStack {
            Color.black.ignoresSafeArea()
            if r.cameraOn || r.cameraStarting {
                CameraPreview(model: model, overlay: r.overlay, zoom: r.zoom?.level, quarter: tilt.quarter)
                    .ignoresSafeArea()
            }
            if r.phase == "scanning" {
                // A code on a monitor is wide: the phone is turned on its side to fill the
                // picture with it, usually with the rotation lock on. The status and the panel
                // turn with the phone, so that they read upright either way.
                Turned(quarter: tilt.quarter) {
                    ScanChrome(recv: r)
                }
                .onAppear { tilt.start() }
                .onDisappear { tilt.stop() }
            }
            if r.phase == "start" {
                StartPane(recv: r)
            }
            if r.phase == "done", let d = r.done {
                DoneScreen(done: d)
                    .transition(.opacity.combined(with: .scale(scale: 0.98)))
            }
        }
        .overlay(alignment: .top) {
            // the done screen keeps the way out (the core keeps the result until "receive
            // another"); the full-screen reader carries the button in its own header.
            // While scanning the bar belongs to the layer that turns with the phone.
            if r.phase != "scanning" && (r.phase != "done" || r.done?.reader == false) {
                TopBar(recv: r)
            }
        }
        .animation(.easeOut(duration: 0.2), value: r.phase)
    }
}

/// The way home and, while scanning, the status.
private struct TopBar: View {
    @Environment(AppModel.self) private var model
    let recv: RecvVM
    /// The camera tools at the end of the bar (a wide, low screen has no room for them above the panel).
    var tools = false
    /// Space at both ends (more when the corners hold the scan frame).
    var side: CGFloat = 14

    var body: some View {
        HStack(spacing: 10) {
            HomeButton { model.dispatch(Ev.navigate(.home)) }
            if recv.phase == "scanning" {
                HStack(spacing: 8) {
                    StatusDot(live: recv.live)
                    Text(recv.status).font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.text).lineLimit(1)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Capsule().fill(Theme.panelOpaque))
                .overlay(Capsule().stroke(Theme.line, lineWidth: 1))
                .accessibilityElement(children: .combine)
            }
            if tools {
                CamTools(recv: recv)
            } else {
                Spacer()
            }
        }
        .padding(.horizontal, side)
        .padding(.top, 8)
        .debugFrame("topbar")
    }
}

/// Everything over the live picture while scanning: the bar at the top, the corner guides,
/// the camera tools and the panel at the bottom. Nothing covers the middle.
private struct ScanChrome: View {
    let recv: RecvVM
    /// The bottom panel's height with the camera tools: the guides end above it.
    @State private var dockHeight: CGFloat = 180

    private static let dockBottom: CGFloat = 6

    var body: some View {
        GeometryReader { g in
            // On its side the screen is wide and low, and the code fills it: the panel becomes
            // one line and a bar, and the camera tools move up into the top bar.
            let compact = g.size.width > g.size.height
            let tools = true // the cover button is always there
            ZStack {
                // Where to put the code; once one is found its outline takes over. Upright,
                // the frame is the space between the bar and the panel. On its side the code
                // is meant to fill the screen: the frame is the screen's four corners, and
                // the bar and the panel keep clear of them.
                Guides(inset: compact ? 0 : nil)
                    .padding(.top, compact ? 6 : 62)
                    .padding(.bottom, compact ? 6 : dockHeight + Self.dockBottom + 18)
                    .padding(.horizontal, compact ? 6 : 0)
                    .opacity(recv.live ? 0 : 1)
                    .animation(.easeOut(duration: 0.3), value: recv.live)
                    .debugFrame("guides")
                VStack(spacing: 0) {
                    Spacer(minLength: 0)
                    VStack(spacing: 10) {
                        if tools && !compact {
                            CamTools(recv: recv)
                        }
                        Hud(recv: recv, compact: compact)
                            .debugFrame("panel")
                    }
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { dockHeight = $0 }
                }
                .padding(.horizontal, compact ? 48 : 10)
                .padding(.bottom, Self.dockBottom)
                .frame(maxWidth: compact ? 720 : 560)
                .frame(maxWidth: .infinity)
            }
            .frame(width: g.size.width, height: g.size.height)
            .overlay(alignment: .top) { TopBar(recv: recv, tools: tools && compact, side: compact ? 48 : 14) }
        }
    }
}

/// How the phone is held, read from gravity: it works with the rotation lock on, when the
/// interface itself stays upright. 0: as the interface is; 1 and -1: a quarter turn
/// clockwise / anticlockwise brings the content upright.
@MainActor
@Observable
final class Tilt {
    private(set) var quarter = 0
    @ObservationIgnored private let motion = CMMotionManager()

    func start() {
        guard motion.isAccelerometerAvailable, !motion.isAccelerometerActive else { return }
        motion.accelerometerUpdateInterval = 0.2
        motion.startAccelerometerUpdates(to: .main) { [weak self] data, _ in
            guard let a = data?.acceleration else { return }
            MainActor.assumeIsolated { self?.update(x: a.x, y: a.y) }
        }
    }

    func stop() {
        motion.stopAccelerometerUpdates()
        quarter = 0
    }

    /// Gravity along the screen's axes, in g (x to the right, y up; upright: y = -1).
    private func update(x: Double, y: Double) {
        var q = quarter
        if abs(x) > 0.75 && abs(y) < 0.5 {
            q = x < 0 ? 1 : -1 // on its side: the right edge up, or the left
        } else if y < -0.75 {
            q = 0 // upright
        }
        // (flat on a table, upside down, in between: as it was)
        // an interface that has turned by itself (rotation lock off) needs nothing added
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        if let o = scene?.interfaceOrientation, !o.isPortrait {
            q = 0
        }
        if q != quarter {
            quarter = q
        }
    }
}

/// Lays `content` out for the space as it is when the phone is held on its side (width and
/// height exchanged) and turns it a quarter, so that it fills the same space, upright.
private struct Turned<Content: View>: View {
    let quarter: Int
    @ViewBuilder var content: Content

    var body: some View {
        if quarter == 0 {
            content
        } else {
            // (inside the safe area: the turned content keeps clear of the island and the
            // home indicator, which are now at its sides)
            GeometryReader { g in
                content
                    .frame(width: g.size.height, height: g.size.width)
                    .rotationEffect(.degrees(Double(quarter) * 90))
                    .position(x: g.size.width / 2, y: g.size.height / 2)
            }
        }
    }
}

/// Four corner brackets: the frame to put the sender's code in.
private struct Guides: View {
    /// Space left and right of the frame; nil: a twentieth of the width.
    var inset: CGFloat? = nil

    var body: some View {
        GeometryReader { g in
            let inset = inset ?? max(22, g.size.width * 0.05)
            if g.size.height > 70 && g.size.width > 2 * inset + 70 {
                GuideCorners()
                    .stroke(Color.white.opacity(0.7), style: StrokeStyle(lineWidth: 3, lineCap: .butt))
                    .shadow(color: .black.opacity(0.6), radius: 3)
                    .padding(.horizontal, inset)
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

private struct GuideCorners: Shape {
    var arm: CGFloat = 30
    var radius: CGFloat = 10

    func path(in rect: CGRect) -> Path {
        let r = rect.insetBy(dx: 1.5, dy: 1.5)
        var p = Path()
        // each corner: along one edge into the corner, round it, out along the other
        let corners: [(CGPoint, CGPoint, CGPoint)] = [
            (CGPoint(x: r.minX, y: r.minY + arm), CGPoint(x: r.minX, y: r.minY), CGPoint(x: r.minX + arm, y: r.minY)),
            (CGPoint(x: r.maxX - arm, y: r.minY), CGPoint(x: r.maxX, y: r.minY), CGPoint(x: r.maxX, y: r.minY + arm)),
            (CGPoint(x: r.maxX, y: r.maxY - arm), CGPoint(x: r.maxX, y: r.maxY), CGPoint(x: r.maxX - arm, y: r.maxY)),
            (CGPoint(x: r.minX + arm, y: r.maxY), CGPoint(x: r.minX, y: r.maxY), CGPoint(x: r.minX, y: r.maxY - arm)),
        ]
        for (a, corner, b) in corners {
            p.move(to: a)
            p.addArc(tangent1End: corner, tangent2End: b, radius: radius)
            p.addLine(to: b)
        }
        return p
    }
}

/// Zoom and camera switch, at the edge of the picture just above the panel.
private struct CamTools: View {
    @Environment(AppModel.self) private var model
    let recv: RecvVM

    var body: some View {
        HStack(spacing: 8) {
            Spacer()
            // (the zoom level shows once zoomed in, as the way back: at 1× it says nothing)
            if let z = recv.zoom, z.active {
                Button { model.dispatch(Ev.resetZoom) } label: {
                    Text(z.label)
                        .font(Theme.mono(13, .semibold))
                        .foregroundStyle(Theme.text)
                        .padding(.horizontal, 14)
                        .frame(minWidth: 56, minHeight: 44)
                        .background(Capsule().fill(Theme.panelOpaque))
                        .overlay(Capsule().stroke(z.active ? Theme.cyan : Theme.line2, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(model.t("zoomHint"))
                .accessibilityValue(z.label)
            }
            Button { model.dispatch(Ev.toggleCover) } label: { Image(systemName: recv.coverOn ? "eye.slash" : "eye") }
                .buttonStyle(IconButtonStyle(background: Theme.panelOpaque))
                .accessibilityLabel(model.t("cover"))
                .accessibilityAddTraits(recv.coverOn ? .isSelected : [])
            if recv.canSwitch {
                Button { model.dispatch(Ev.switchCamera) } label: { Image(systemName: "arrow.triangle.2.circlepath.camera") }
                    .buttonStyle(IconButtonStyle(background: Theme.panelOpaque))
                    .accessibilityLabel(model.t("switchCam"))
            }
        }
    }
}

/// Name and percentage, progress, speed and time left, one tip; the rest under Details.
/// `compact` (a wide, low screen): name, speed and percentage on one line over the bar.
private struct Hud: View {
    @Environment(AppModel.self) private var model
    let recv: RecvVM
    var compact = false
    /// Folded at first; the choice is remembered.
    @AppStorage("lumen.recv.details") private var details = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if compact {
                HStack(alignment: .center, spacing: 10) {
                    Text(recv.name).font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.text).lineLimit(1).truncationMode(.middle)
                    Text(recv.line).font(.system(size: 13)).monospacedDigit().foregroundStyle(Theme.muted).lineLimit(1).layoutPriority(1)
                    Spacer(minLength: 0)
                    Text(recv.pct).font(Theme.mono(18, .bold)).foregroundStyle(Theme.text).contentTransition(.numericText()).layoutPriority(2)
                    detailsButton(label: false)
                }
                .padding(.bottom, 6)
                bar.frame(height: 6)
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text(recv.name).font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.text).lineLimit(1).truncationMode(.middle)
                    Spacer()
                    Text(recv.pct).font(Theme.mono(22, .bold)).foregroundStyle(Theme.text).contentTransition(.numericText())
                }
                .padding(.bottom, 10)
                .accessibilityElement(children: .combine)
                bar.frame(height: 8)
                // keeps its height while the line is empty (the Details button holds it)
                HStack(spacing: 10) {
                    Text(recv.line)
                        .font(.system(size: 13.5))
                        .monospacedDigit()
                        .foregroundStyle(Theme.text)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    detailsButton(label: true)
                }
                .padding(.top, 4)
            }
            if details || !recv.tipOk {
                Text(recv.tip)
                    .font(.system(size: 13))
                    .foregroundStyle(recv.tipOk ? Theme.muted : Theme.amber)
                    .lineLimit(1)
                    .frame(minHeight: 18, alignment: .leading)
                    .padding(.top, compact ? 6 : 0)
            }
            if details {
                VStack(alignment: .leading, spacing: 8) {
                    FlowRow(spacing: 18, alignCenter: false) {
                        ForEach(recv.metrics, id: \.self) { m in
                            (Text(m.label + " ").foregroundStyle(Theme.muted) + Text(m.value).fontWeight(.semibold).monospacedDigit().foregroundStyle(Theme.text))
                                .font(.system(size: 12.5))
                                .lineLimit(1)
                        }
                    }
                    Text(recv.diag)
                        .font(Theme.mono(11))
                        .foregroundStyle(Theme.faint)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, compact ? 8 : 10)
                .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
                .padding(.top, compact ? 8 : 10)
                .transition(.opacity)
            }
        }
        .padding(.horizontal, compact ? 14 : 16)
        .padding(.vertical, compact ? 9 : 14)
        .panel(opaque: true)
    }

    private var bar: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.08))
                Capsule().fill(Theme.spectrum).frame(width: max(0, g.size.width * CGFloat(recv.progress)))
                    .animation(.easeOut(duration: 0.25), value: recv.progress)
            }
        }
        .accessibilityHidden(true)
    }

    private func detailsButton(label: Bool) -> some View {
        Button {
            withAnimation(.easeOut(duration: 0.2)) { details.toggle() }
        } label: {
            HStack(spacing: 4) {
                if label {
                    Text(model.t("details"))
                }
                Image(systemName: "chevron.down")
                    .font(.system(size: 11, weight: .semibold))
                    .rotationEffect(.degrees(details ? 180 : 0))
            }
            .font(.system(size: 12.5))
            .foregroundStyle(Theme.muted)
            .padding(.leading, label ? 12 : 10)
            .padding(.trailing, 10)
            .frame(minHeight: label ? 34 : 30)
            .background(Capsule().fill(Color.white.opacity(0.04)))
            .overlay(Capsule().stroke(Theme.line2, lineWidth: 1))
            .padding(.vertical, label ? 5 : 0)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(model.t("details"))
        .accessibilityAddTraits(details ? .isSelected : [])
    }
}

private struct StartPane: View {
    @Environment(AppModel.self) private var model
    let recv: RecvVM

    var body: some View {
        EntryPanel(symbol: "viewfinder", tint: Theme.pink, title: model.t("recvTitle"), switchLabel: model.t("goSend"),
            onSwitch: { model.dispatch(Ev.navigate(.send)) }
        ) {
            VStack(alignment: .leading, spacing: 12) {
                if let error = recv.error {
                    Text(error).font(.system(size: 14)).foregroundStyle(Theme.red)
                }
                if let note = recv.note {
                    Text(note).font(.system(size: 13)).foregroundStyle(Theme.amber)
                }
                Spacer(minLength: 0)
                if recv.canOpenSettings {
                    Button(model.t("openSettings")) { model.dispatch(Ev.openSettings) }
                        .buttonStyle(LumenButtonStyle(primary: true, fill: true, height: 48))
                } else {
                    Button {
                        model.dispatch(Ev.openCamera)
                    } label: {
                        HStack(spacing: 8) {
                            if recv.cameraStarting { ProgressView().tint(Theme.ink).scaleEffect(0.8) }
                            Text(model.t("openCam"))
                        }
                    }
                    .buttonStyle(LumenButtonStyle(primary: true, fill: true, height: 48))
                    .disabled(recv.cameraStarting)
                }
            }
            .frame(height: 320)
        }
    }
}
