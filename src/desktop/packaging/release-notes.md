## Lumen Code <version>

A UI and documentation update. The Protocol 1.0 wire format is unchanged and remains compatible with version 1.0.0.

- A compact, centred desktop home screen with consistent send and receive entry panels.
- Fixed-size file/text panels and aligned actions across the website, Android and iPhone apps.
- Keyboard completion controls for text input; simpler receiving without the image-import entry.
- A calmer website transfer illustration, matching app messaging and clearer real-device speed results.
- Shorter privacy and service terms explaining local processing, transfer risks and responsibility boundaries.
- Both app languages remain available offline in Android App Bundles.

## Desktop downloads

| System | File |
|---|---|
| macOS (Apple silicon and Intel) | `LumenCode-<version>-macos-universal.dmg` — signed and notarized; `-arm64` / `-x86_64` images are smaller |
| Windows 10/11 (x86_64) | `LumenCode-<version>-windows-x86_64.zip` — unzip and run `Lumen Code.exe` |
| Linux (x86_64, aarch64) | `LumenCode-<version>-linux-<arch>.tar.gz` — see `README.txt` inside (Vulkan, Wayland or X11) |

The Windows build is not code-signed yet, so SmartScreen warns on first launch: choose "More info" > "Run anyway". The webcam receiver is tested on macOS. The Windows (Media Foundation) and Linux (Video4Linux) camera code is new and has not been tested on real machines; reports are welcome.

Phones: the iPhone and Android apps are coming to the App Store and Google Play; the web version at https://lumencode.link works in any browser with a camera, and every version sends to every other.

Checksums: `SHA256SUMS` (Windows, Linux) and `SHA256SUMS-macos` (macOS images, attached by hand after signing).
