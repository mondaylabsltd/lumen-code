import AVFoundation
import SwiftUI
import UIKit

/// The live camera picture (aspect fill), the detected code's outline, and pinch to zoom.
/// The picture is composited by the system straight from the camera; the app never draws it.
struct CameraPreview: UIViewRepresentable {
    let model: AppModel
    let overlay: OverlayVM?
    let zoom: Float?
    /// How the phone is held (quarter turns), for the text on the cover.
    var quarter: Int = 0

    func makeUIView(context: Context) -> PreviewUIView {
        let v = PreviewUIView()
        v.previewLayer.session = model.camera.session
        v.previewLayer.videoGravity = .resizeAspectFill
        let camera = model.camera
        v.onRotation = { angle in camera.rotation = angle }
        camera.onDeviceChange = { [weak v] dev in v?.attach(device: dev) }
        if let dev = camera.device { v.attach(device: dev) }
        v.onZoom = { [weak model] z in model?.dispatch(Ev.zoom(z)) }
        return v
    }

    func updateUIView(_ v: PreviewUIView, context: Context) {
        v.zoomLevel = zoom
        v.quarter = quarter
        v.show(overlay)
    }
}

final class PreviewUIView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    var onRotation: ((UInt32) -> Void)?
    var onZoom: ((Float) -> Void)?
    var zoomLevel: Float?
    private let outline = CAShapeLayer()
    // The cover over a code that reads well (see Overlay::cover in the core): a plain plate a
    // little larger than the outline, with the progress on it. Its opacity fades; its shape
    // follows the code at once.
    private let plate = CAShapeLayer()
    private let progress = CATextLayer()
    var quarter = 0
    private var coordinator: AVCaptureDevice.RotationCoordinator?
    private var observation: NSKeyValueObservation?
    private var pinchStart: Float = 1
    private var last: OverlayVM?

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .black
        outline.fillColor = UIColor.clear.cgColor
        outline.lineWidth = 3
        outline.lineJoin = .round
        outline.shadowOpacity = 1
        outline.shadowRadius = 6
        outline.shadowOffset = .zero
        outline.actions = ["path": NSNull(), "strokeColor": NSNull(), "shadowColor": NSNull(), "opacity": NSNull()]
        plate.fillColor = UIColor(red: 10 / 255, green: 13 / 255, blue: 20 / 255, alpha: 1).cgColor
        plate.opacity = 0
        plate.actions = ["path": NSNull()]
        progress.alignmentMode = .center
        progress.contentsScale = UIScreen.main.scale
        progress.foregroundColor = UIColor(white: 1, alpha: 0.9).cgColor
        progress.font = UIFont.monospacedDigitSystemFont(ofSize: 28, weight: .semibold)
        progress.opacity = 0
        progress.actions = ["position": NSNull(), "bounds": NSNull(), "transform": NSNull(), "string": NSNull(), "fontSize": NSNull()]
        layer.addSublayer(plate)
        layer.addSublayer(progress)
        layer.addSublayer(outline)
        addGestureRecognizer(UIPinchGestureRecognizer(target: self, action: #selector(pinched(_:))))
    }

    required init?(coder: NSCoder) { fatalError() }

    /// Keeps the picture upright as the phone turns (and tells the core how it is shown).
    func attach(device: AVCaptureDevice) {
        observation = nil
        let c = AVCaptureDevice.RotationCoordinator(device: device, previewLayer: previewLayer)
        coordinator = c
        apply(c.videoRotationAngleForHorizonLevelPreview)
        observation = c.observe(\.videoRotationAngleForHorizonLevelPreview, options: [.new]) { [weak self] c, _ in
            DispatchQueue.main.async { self?.apply(c.videoRotationAngleForHorizonLevelPreview) }
        }
    }

    private func apply(_ angle: CGFloat) {
        if let conn = previewLayer.connection, conn.isVideoRotationAngleSupported(angle) {
            conn.videoRotationAngle = angle
        }
        onRotation?(UInt32((Int(angle.rounded()) % 360 + 360) % 360))
        show(last)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        outline.frame = bounds
        plate.frame = bounds
        show(last)
    }

    func show(_ o: OverlayVM?) {
        last = o
        guard let o, o.points.count == 4, o.frameW > 0, o.frameH > 0 else {
            outline.path = nil
            plate.opacity = 0
            progress.opacity = 0
            return
        }
        let path = UIBezierPath()
        var corners: [CGPoint] = []
        for (i, p) in o.points.enumerated() where p.count == 2 {
            // frame pixels -> device point of interest (0…1 in sensor orientation) -> layer
            let dp = CGPoint(x: CGFloat(p[0]) / CGFloat(o.frameW), y: CGFloat(p[1]) / CGFloat(o.frameH))
            let lp = previewLayer.layerPointConverted(fromCaptureDevicePoint: dp)
            corners.append(lp)
            if i == 0 { path.move(to: lp) } else { path.addLine(to: lp) }
        }
        path.close()
        if corners.count == 4 {
            // a twentieth larger than the outline: a hand that moves shows no flickering edge
            let c = CGPoint(x: corners.map(\.x).reduce(0, +) / 4, y: corners.map(\.y).reduce(0, +) / 4)
            let cover = UIBezierPath()
            for (i, p) in corners.enumerated() {
                let q = CGPoint(x: c.x + (p.x - c.x) * 1.05, y: c.y + (p.y - c.y) * 1.05)
                if i == 0 { cover.move(to: q) } else { cover.addLine(to: q) }
            }
            cover.close()
            plate.path = cover.cgPath
            plate.opacity = o.cover * 0.97
            let side = min(hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y), hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y))
            let size = max(14, min(34, side * 0.22))
            progress.string = o.label
            progress.fontSize = size
            progress.bounds = CGRect(x: 0, y: 0, width: size * 5, height: size * 1.25)
            progress.position = c
            progress.setAffineTransform(CGAffineTransform(rotationAngle: CGFloat(quarter) * .pi / 2))
            progress.opacity = o.cover >= 1 && !o.label.isEmpty ? 1 : 0
        }
        let color: UIColor = switch o.tone {
        case "good": UIColor(red: 43 / 255, green: 220 / 255, blue: 116 / 255, alpha: 1)
        case "fair": UIColor(red: 1, green: 214 / 255, blue: 10 / 255, alpha: 1)
        default: UIColor(red: 1, green: 84 / 255, blue: 104 / 255, alpha: 1)
        }
        outline.path = path.cgPath
        outline.strokeColor = color.cgColor
        outline.shadowColor = color.cgColor
    }

    @objc private func pinched(_ g: UIPinchGestureRecognizer) {
        switch g.state {
        case .began: pinchStart = zoomLevel ?? 1
        case .changed: onZoom?(pinchStart * Float(g.scale))
        default: break
        }
    }
}
