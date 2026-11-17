import AVFoundation
import LumenCore
import UIKit

/// The back camera, feeding the core's scan pipeline.
///
/// Frames arrive in the sensor's native 4:2:0 full-range Y'CbCr: no colour conversion, no
/// copy. The core reads the two planes in place through their addresses while the buffer is
/// locked, scales only the region around the code and decides itself which frames to scan
/// (frame-locked to the sender), so this delegate does almost nothing per frame.
final class CameraController: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate, @unchecked Sendable {
    let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "lumen.camera", qos: .userInitiated)
    private let output = AVCaptureVideoDataOutput()
    private let core: LumenCore
    private var input: AVCaptureDeviceInput?
    private var configured = false
    /// Clockwise rotation that shows the buffer upright; written on the main thread.
    private let rotationLock = NSLock()
    private var _rotation: UInt32 = 90
    var rotation: UInt32 {
        get { rotationLock.lock(); defer { rotationLock.unlock() }; return _rotation }
        set { rotationLock.lock(); _rotation = newValue; rotationLock.unlock() }
    }
    private var zoom: CGFloat = 1
    /// Longest exposure auto exposure may use, in microseconds (0: the camera's own limit).
    private var maxExposureUs = 0
    #if DEBUG
    /// Debug: raw frames still to keep (written to Documents/<tag>/frame-N.nv12 once all are in
    /// memory, so that consecutive captures are kept even at 240 fps).
    var dumpRemaining = 0
    private var exposurePinned = false
    private var dumpTag = ""
    private var dumpFrames: [(Double, Data)] = []
    private var dumpInfo = "-"
    #endif
    /// The device in use (main-thread reads for the preview's rotation coordinator).
    private(set) var device: AVCaptureDevice?
    var onDeviceChange: ((AVCaptureDevice) -> Void)?

    init(core: LumenCore) {
        self.core = core
        super.init()
    }

    private static func devices() -> [AVCaptureDevice] {
        // the back cameras first (wide, then ultra wide, then tele), the front one last
        let back = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInWideAngleCamera, .builtInUltraWideCamera, .builtInTelephotoCamera], mediaType: .video, position: .back
        ).devices
        let front = AVCaptureDevice.DiscoverySession(deviceTypes: [.builtInWideAngleCamera], mediaType: .video, position: .front).devices
        return back + front
    }

    /// Opens camera number `index` and answers the core (main thread).
    func start(device index: Int, answer: @escaping @MainActor ([String: Any]) -> Void) {
        let reply: ([String: Any]) -> Void = { out in DispatchQueue.main.async { MainActor.assumeIsolated { answer(out) } } }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            queue.async { self.configure(index, reply: reply) }
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { granted in
                if granted {
                    self.queue.async { self.configure(index, reply: reply) }
                } else {
                    reply(["type": "camera", "ok": false, "error": "denied"])
                }
            }
        default:
            reply(["type": "camera", "ok": false, "error": "denied"])
        }
    }

    private func configure(_ index: Int, reply: @escaping ([String: Any]) -> Void) {
        let all = Self.devices()
        guard !all.isEmpty else {
            reply(["type": "camera", "ok": false, "error": "unavailable"])
            return
        }
        let dev = all[index % all.count]
        session.beginConfiguration()
        if let old = input { session.removeInput(old) }
        do {
            let inp = try AVCaptureDeviceInput(device: dev)
            guard session.canAddInput(inp) else { throw NSError(domain: "lumen", code: 1) }
            session.addInput(inp)
            input = inp
        } catch {
            session.commitConfiguration()
            reply(["type": "camera", "ok": false, "error": "failed", "message": error.localizedDescription])
            return
        }
        // 1080p: what the sender's cell size is chosen for. More pixels only cost heat.
        if session.canSetSessionPreset(.hd1920x1080) {
            session.sessionPreset = .hd1920x1080
        } else {
            session.sessionPreset = .high
        }
        if !configured {
            output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange]
            output.alwaysDiscardsLateVideoFrames = true
            output.setSampleBufferDelegate(self, queue: queue)
            if session.canAddOutput(output) { session.addOutput(output) }
            configured = true
        }
        if let conn = output.connection(with: .video), conn.isVideoStabilizationSupported {
            conn.preferredVideoStabilizationMode = .off // stabilisation crops and delays: worse for decoding
        }
        do {
            try dev.lockForConfiguration()
            if dev.isFocusModeSupported(.continuousAutoFocus) { dev.focusMode = .continuousAutoFocus }
            if dev.isFocusPointOfInterestSupported { dev.focusPointOfInterest = CGPoint(x: 0.5, y: 0.5) }
            if dev.isAutoFocusRangeRestrictionSupported { dev.autoFocusRangeRestriction = .near }
            if dev.isExposureModeSupported(.continuousAutoExposure) { dev.exposureMode = .continuousAutoExposure }
            // A screen is a light source: auto exposure tends to clip its brightest colours,
            // which is where cyan and yellow differ. Half a stop under keeps them apart.
            dev.setExposureTargetBias(max(dev.minExposureTargetBias, -0.5), completionHandler: nil)
            if dev.isLowLightBoostSupported { dev.automaticallyEnablesLowLightBoostWhenAvailable = false }
            // 30 fps is plenty for a 12–20 fps sender; 60 would double the work for nothing
            let thirty = CMTime(value: 1, timescale: 30)
            if dev.activeFormat.videoSupportedFrameRateRanges.contains(where: { $0.minFrameRate <= 30 && $0.maxFrameRate >= 30 }) {
                dev.activeVideoMinFrameDuration = thirty
                dev.activeVideoMaxFrameDuration = thirty
            }
            dev.videoZoomFactor = dev.minAvailableVideoZoomFactor
            dev.unlockForConfiguration()
        } catch {}
        session.commitConfiguration()
        if !session.isRunning { session.startRunning() }
        device = dev
        DispatchQueue.main.async { self.onDeviceChange?(dev) }
        let zMin = Float(dev.minAvailableVideoZoomFactor)
        let zMax = Float(min(dev.maxAvailableVideoZoomFactor, dev.minAvailableVideoZoomFactor * 8))
        zoom = dev.videoZoomFactor
        // the fastest 1080p mode this camera has, whatever it is (240 today)
        let maxFps = Self.maxRate(for: dev, width: 1920)
        let uhd = Self.format(for: dev, width: 3840, fps: 30) != nil
        reply(["type": "camera", "ok": true, "zoomMin": zMin, "zoomMax": zMax, "zoom": Float(dev.videoZoomFactor), "devices": all.count,
               "maxFps": maxFps, "uhd": uhd])
    }

    /// The highest capture rate among the formats [`format(for:width:fps:)`] would accept.
    private static func maxRate(for dev: AVCaptureDevice, width: Int32) -> Int {
        let rates = dev.formats.filter { f in
            let d = CMVideoFormatDescriptionGetDimensions(f.formatDescription)
            let sub = CMFormatDescriptionGetMediaSubType(f.formatDescription)
            return d.width == width && d.height * 16 == width * 9 && !f.isVideoBinned
                && (sub == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange || sub == kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange)
        }.flatMap { $0.videoSupportedFrameRateRanges.map { Int($0.maxFrameRate.rounded()) } }
        return max(30, rates.max() ?? 30)
    }

    /// A 16:9 4:2:0 format of the given width (1920 or 3840) that reaches `fps`: full sensor
    /// resolution only (binned modes halve the detail a cell needs), full range preferred.
    private static func format(for dev: AVCaptureDevice, width: Int32, fps: Double) -> AVCaptureDevice.Format? {
        let candidates = dev.formats.filter { f in
            let d = CMVideoFormatDescriptionGetDimensions(f.formatDescription)
            let sub = CMFormatDescriptionGetMediaSubType(f.formatDescription)
            return d.width == width && d.height * 16 == width * 9 && !f.isVideoBinned
                && (sub == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange || sub == kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange)
                && f.videoSupportedFrameRateRanges.contains { $0.maxFrameRate >= fps }
        }
        return candidates.first { CMFormatDescriptionGetMediaSubType($0.formatDescription) == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange } ?? candidates.first
    }

    /// Switches the capture mode the core asks for: 30/60 fps, 1080p/4K (4K at 60 when the
    /// camera has it, else 4K at 30).
    func setMode(fps: Int, uhd: Bool) {
        queue.async {
            guard let dev = self.device else { return }
            var rate = Double(fps)
            var f = Self.format(for: dev, width: uhd ? 3840 : 1920, fps: rate)
            if f == nil && uhd {
                // 4K cannot go that fast here: the rate matters more than the resolution
                f = Self.format(for: dev, width: 1920, fps: rate)
            }
            while f == nil && rate > 30 {
                rate /= 2
                f = Self.format(for: dev, width: uhd ? 3840 : 1920, fps: rate) ?? Self.format(for: dev, width: 1920, fps: rate)
            }
            guard let format = f else { return }
            do {
                try dev.lockForConfiguration()
                defer { dev.unlockForConfiguration() }
                if dev.activeFormat != format {
                    dev.activeFormat = format
                    dev.setExposureTargetBias(max(dev.minExposureTargetBias, -0.5), completionHandler: nil)
                    if dev.isFocusModeSupported(.continuousAutoFocus) { dev.focusMode = .continuousAutoFocus }
                    dev.videoZoomFactor = self.zoom.clamped(dev.minAvailableVideoZoomFactor, dev.maxAvailableVideoZoomFactor)
                }
                let d = CMTime(value: 1, timescale: CMTimeScale(rate))
                dev.activeVideoMinFrameDuration = d
                dev.activeVideoMaxFrameDuration = d
                self.applyMaxExposure(dev) // a new format forgets the limit
            } catch {}
        }
    }

    /// Caps the exposure time (the gain follows by itself). A capture that stays open across a
    /// frame change of the sender holds a blend of both frames; at 120 fps auto exposure would
    /// otherwise use the whole 8 ms.
    func setMaxExposure(us: Int, pin: Bool = false) {
        queue.async {
            #if DEBUG
            // a test script's value stays until the script changes it
            if self.exposurePinned && !pin { return }
            self.exposurePinned = pin
            #endif
            self.maxExposureUs = us
            guard let dev = self.device else { return }
            do {
                try dev.lockForConfiguration()
                self.applyMaxExposure(dev)
                dev.unlockForConfiguration()
            } catch {}
        }
    }

    /// Call with the device locked for configuration.
    private func applyMaxExposure(_ dev: AVCaptureDevice) {
        guard maxExposureUs > 0 else {
            dev.activeMaxExposureDuration = .invalid // the format's default
            return
        }
        let f = dev.activeFormat
        let want = CMTime(value: CMTimeValue(maxExposureUs), timescale: 1_000_000)
        dev.activeMaxExposureDuration = min(max(want, f.minExposureDuration), f.maxExposureDuration)
    }

    #if DEBUG
    func grab(_ n: Int, tag: String = "") {
        queue.async {
            self.dumpTag = tag
            self.dumpFrames = []
            self.dumpRemaining = n
        }
    }
    #endif

    func stop() {
        queue.async {
            if self.session.isRunning { self.session.stopRunning() }
        }
    }

    func setZoom(_ level: Float) {
        queue.async {
            guard let dev = self.device else { return }
            do {
                try dev.lockForConfiguration()
                let z = CGFloat(level).clamped(dev.minAvailableVideoZoomFactor, dev.maxAvailableVideoZoomFactor)
                dev.videoZoomFactor = z
                self.zoom = z
                dev.unlockForConfiguration()
            } catch {}
        }
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard let pb = CMSampleBufferGetImageBuffer(sampleBuffer), CVPixelBufferGetPlaneCount(pb) >= 2 else { return }
        CVPixelBufferLockBaseAddress(pb, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
        guard let y = CVPixelBufferGetBaseAddressOfPlane(pb, 0), let uv = CVPixelBufferGetBaseAddressOfPlane(pb, 1) else { return }
        let yStride = CVPixelBufferGetBytesPerRowOfPlane(pb, 0)
        let yRows = CVPixelBufferGetHeightOfPlane(pb, 0)
        let uvStride = CVPixelBufferGetBytesPerRowOfPlane(pb, 1)
        let uvRows = CVPixelBufferGetHeightOfPlane(pb, 1)
        let uvAddr = UInt64(UInt(bitPattern: uv))
        #if DEBUG
        if dumpRemaining > 0 {
            dumpRemaining -= 1
            // header: width, height, y stride, uv stride (u32 LE), then the planes
            var head = [UInt32(CVPixelBufferGetWidth(pb)), UInt32(CVPixelBufferGetHeight(pb)), UInt32(yStride), UInt32(uvStride)]
            var data = Data(bytes: &head, count: 16)
            data.append(Data(bytes: y, count: yStride * yRows))
            data.append(Data(bytes: uv, count: uvStride * uvRows))
            if dumpFrames.isEmpty, let d = device {
                // the mode the run starts in (a script may change it before the run is written)
                dumpInfo = String(format: "exp %.6f iso %.0f fps %.0f", d.exposureDuration.seconds, d.iso, 1 / max(d.activeVideoMinFrameDuration.seconds, 1e-6))
            }
            dumpFrames.append((CMSampleBufferGetPresentationTimeStamp(sampleBuffer).seconds, data))
            if dumpRemaining == 0 {
                let (frames, tag, info) = (dumpFrames, dumpTag, dumpInfo)
                dumpFrames = []
                DispatchQueue.global(qos: .utility).async {
                    var dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
                    if !tag.isEmpty { dir = dir.appendingPathComponent(tag) }
                    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
                    var times = info + "\n"
                    for (i, f) in frames.enumerated() {
                        try? f.1.write(to: dir.appendingPathComponent("frame-\(i + 1).nv12"))
                        times += String(format: "%d %.6f\n", i + 1, f.0)
                    }
                    try? times.write(to: dir.appendingPathComponent("times.txt"), atomically: true, encoding: .utf8)
                    print("[lumen-grab] \(frames.count) frames in \(dir.lastPathComponent)")
                }
            }
        }
        #endif
        let frame = CameraFrame(
            width: UInt32(CVPixelBufferGetWidth(pb)), height: UInt32(CVPixelBufferGetHeight(pb)),
            format: .yuv420, rotation: rotation,
            plane0: UInt64(UInt(bitPattern: y)), len0: UInt64(yStride * yRows), rowStride0: UInt32(yStride),
            plane1: uvAddr, len1: UInt64(uvStride * uvRows), rowStride1: UInt32(uvStride), pixelStride1: 2,
            plane2: uvAddr + 1, len2: UInt64(uvStride * uvRows - 1), rowStride2: UInt32(uvStride), pixelStride2: 2
        )
        _ = core.cameraFrame(frame: frame)
    }
}

extension Comparable {
    func clamped(_ lo: Self, _ hi: Self) -> Self { min(max(self, lo), hi) }
}
