## Lumen Code <version>

Faster receiving. The Protocol 1.0 wire format is unchanged, and this version transfers with every earlier 1.0 version.

- From a 60 Hz monitor at 60 FPS to an iPhone 15 Pro, measured: 844 KB/s at density High (470–730 KB/s before) and 1.2 MB/s at density Max. Conditions and the other figures are in the [performance guide](https://github.com/mondaylabsltd/lumen-code/blob/main/docs/guide/04-performance.md).
- The receiver scans every camera frame, each scan in about a quarter of the time, limits the exposure time, and keeps its rate on a warm phone.
- The frame rate goes up to the screen's refresh rate; 60 is no longer a fixed top. The fastest transfer is at half the receiving camera's rate, and the receiver says so when the sender plays too fast.
- A new desktop install starts at 60 FPS on the densest grid, four colours. The code must fill most of the receiving camera's picture; settings you chose are kept.
- Phones: while scanning, the status and the panel turn with a phone held on its side.
- Settings: each label sits next to its own control.

The Android changes of this version compile but were not run on a phone before release.

## Desktop downloads

| System | File |
|---|---|
| macOS (Apple silicon and Intel) | `LumenCode-<version>-macos-universal.dmg` — signed and notarized; `-arm64` / `-x86_64` images are smaller |
| Windows 10/11 (x86_64) | `LumenCode-<version>-windows-x86_64.zip` — unzip and run `Lumen Code.exe` |
| Linux (x86_64, aarch64) | `LumenCode-<version>-linux-<arch>.tar.gz` — see `README.txt` inside (Vulkan, Wayland or X11) |

The Windows build is not code-signed yet, so SmartScreen warns on first launch: choose "More info" > "Run anyway". The webcam receiver is tested on macOS. The Windows (Media Foundation) and Linux (Video4Linux) camera code is new and has not been tested on real machines; reports are welcome.

Phones: the iPhone and Android apps are coming to the App Store and Google Play; the web version at https://lumencode.link works in any browser with a camera, and every version sends to every other.

Checksums: `SHA256SUMS` (Windows, Linux) and `SHA256SUMS-macos` (macOS images, attached by hand after signing).
