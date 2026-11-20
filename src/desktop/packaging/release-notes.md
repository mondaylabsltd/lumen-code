## Lumen Code <version>

The website receives several times faster and now works in Chrome on Android; the apps say what to do when a code does not read. The Protocol 1.0 wire format is unchanged, and this version transfers with every earlier 1.0 version.

- Website in Safari on an iPhone: camera frames are read without a canvas and scanned on the path of the apps. Measured on an iPhone 15 Pro facing a 60 Hz monitor: about 100 KB/s before, 399 KB/s on average with the sender at 20 FPS (248 KB/s at 30 FPS).
- Website in Chrome on Android: the page holds a short exposure while a code is in view. Measured on a Galaxy S22: nothing decoded before, 295 KB/s on average now.
- Advice while receiving. The sender's frame rate a camera can follow is 20 FPS for a camera at 30 and 60 for one at 120, and the receiver says so. When a code is captured but its cells are too small for the camera, it says to move closer, or to lower the density at the sender when the code already fills the picture.
- Desktop receiver: looks for a code on every frame; asks for 1080p first on every system; says so when another program holds the camera.
- Android app: the outline of the code follows a phone held on its side, and the focus is set once on the code and held.

What a camera needs differs: an iPhone 15 Pro or a Galaxy S22 reads cells of 3.5 camera pixels, a Redmi K40 and a MacBook's built-in camera need 6 to 7. Browsers open phone cameras at 1080p and 30 frames a second, so the website receives at about half the rate of the apps or less. Conditions and all figures are in the [performance guide](https://github.com/mondaylabsltd/lumen-code/blob/main/docs/guide/04-performance.md).

1.2.1 added to the phone apps: the send screen takes a picture or a video from the photo library, where it opened the file picker only.

1.2.2 adds two things:

- Receivers cover the code they are reading. A code that changes many times a second is tiring to look at, and once it reads well there is nothing in it to see: a plain dark plate lies over it with the progress on it, thins when the code reads badly and goes when it does not read. The eye button among the camera tools switches it off. The outline of the code no longer comes and goes with single captures.
- Website on phones with several cameras: the receiver opens the main camera at the back. Chrome on a Galaxy S22 gave its ultra-wide, with which the phone had to be held very close. The flip button goes between the main camera at the back and the one at the front, where it used to go round every lens.

Not measured for this version: the Galaxy S22 with the Android app, and Windows and Linux with a camera.

## Desktop downloads

| System | File |
|---|---|
| macOS (Apple silicon and Intel) | `LumenCode-<version>-macos-universal.dmg` — signed and notarized; `-arm64` / `-x86_64` images are smaller |
| Windows 10/11 (x86_64) | `LumenCode-<version>-windows-x86_64.zip` — unzip and run `Lumen Code.exe` |
| Linux (x86_64, aarch64) | `LumenCode-<version>-linux-<arch>.tar.gz` — see `README.txt` inside (Vulkan, Wayland or X11) |

The Windows build is not code-signed yet, so SmartScreen warns on first launch: choose "More info" > "Run anyway". The webcam receiver is tested on macOS. The Windows (Media Foundation) and Linux (Video4Linux) camera code is new and has not been tested on real machines; reports are welcome.

Phones: the iPhone and Android apps are coming to the App Store and Google Play; the web version at https://lumencode.link works in any browser with a camera, and every version sends to every other.

Checksums: `SHA256SUMS` (Windows, Linux) and `SHA256SUMS-macos` (macOS images, attached by hand after signing).
