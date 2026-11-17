//! The Lumen app as one Crux state machine: home, send and receive.
//!
//! Everything here **decides**; nothing here **does**. An [`Event`] updates the [`Model`] and
//! returns commands: a render, a [`ShellOp`] for the platform (camera, haptics, files, screen)
//! or an [`EngineOp`] for the Rust runtime (sender stream, scan pipeline, decoder, timers).
//! No clock, no I/O, no threads — which is what makes the rules testable and identical on
//! iOS, Android and the desktop.
//!
//! The rules come from the web demo (`src/web/js/*-app.js`): cell geometry, the dock that
//! hides itself, frame-locked scanning (in the engine), the dashboard and its hints, the
//! result reader. The apps add what a phone can do better: haptics, the screen kept on at
//! full brightness while a code is shown, system bars hidden, the camera released whenever
//! it is not needed.

pub mod ops;
pub mod view;

use crate::content::{Classified, Kind};
use crate::engine::recv::ScanReport;
use crate::engine::send::SenderInfo;
use crate::engine::sink::ProgressFact;
use crate::geometry::{self, Density, Geometry, Viewport};
use crate::i18n::Lang;
use crux_core::macros::effect;
use crux_core::render::{render, RenderOperation};
use crux_core::{App, Command};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

pub use ops::{CameraError, EngineOp, EngineOutput, HapticKind, ShellOp, ShellOutput};
pub use view::ViewModel;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Platform {
    #[default]
    Ios,
    Android,
    Desktop,
}

impl Platform {
    pub fn mobile(self) -> bool {
        self != Platform::Desktop
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Screen {
    #[default]
    Home,
    Send,
    Receive,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceTab {
    #[default]
    File,
    Text,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SendPhase {
    /// Choosing a file or typing text
    #[default]
    Pick,
    /// Building the payload
    Preparing,
    /// The code is on screen (playing or paused)
    Ready,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecvPhase {
    #[default]
    Start,
    Scanning,
    Done,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ReaderPrefs {
    pub pretty: bool,
    pub wrap: bool,
    pub font: i32,
    /// Transfer statistics unfolded in the reader; unset = by screen size.
    pub stats: Option<bool>,
}

impl Default for ReaderPrefs {
    fn default() -> Self {
        ReaderPrefs { pretty: true, wrap: true, font: 0, stats: None }
    }
}

/// Choices that persist across launches.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Prefs {
    pub lang: Option<Lang>,
    pub density: Density,
    /// 1 = 4 colours, 2 = 8 colours
    pub mode: u8,
    /// 0..=2 (low, mid, high)
    pub ecc: u8,
    pub fps: u32,
    pub source: SourceTab,
    pub reader: ReaderPrefs,
    /// The photosensitivity warning was acknowledged; until then a code waits, paused.
    #[serde(default)]
    pub flash_ok: bool,
    /// Which defaults these choices started from (see [`Prefs::migrated`]).
    #[serde(default)]
    pub defaults: u32,
}

/// The current generation of defaults. 2: a desktop sender starts at 60 fps, densest grid.
pub const DEFAULTS: u32 = 2;

impl Default for Prefs {
    fn default() -> Self {
        Prefs { lang: None, density: Density::Auto, mode: 1, ecc: 1, fps: 12, source: SourceTab::File, reader: ReaderPrefs::default(), flash_ok: false, defaults: DEFAULTS }
    }
}

impl Prefs {
    /// What a first launch starts with.
    ///
    /// A desktop screen is large and refreshes 60 times a second or more: 60 frames a second
    /// on the densest grid, four colours. Measured from a 27-inch 60 Hz monitor to an
    /// iPhone 15 Pro (120 captures a second): 1.2 MB/s, against 0.84 MB/s one density step
    /// lower and 0.5 MB/s at the density a phone screen uses. The code must fill most of the
    /// camera's frame (3.4 camera pixels per cell or more); the receiver says so when it does
    /// not. A phone's screen is small and its refresh rate varies: the cautious settings stay.
    pub fn for_platform(platform: Platform) -> Prefs {
        match platform {
            Platform::Desktop => Prefs { density: Density::Max, fps: 60, ..Prefs::default() },
            Platform::Ios | Platform::Android => Prefs::default(),
        }
    }

    /// Stored choices made under older defaults: send settings that are exactly the old
    /// defaults were most likely never chosen, and follow the defaults of today.
    fn migrated(mut self, platform: Platform) -> Prefs {
        if self.defaults < DEFAULTS {
            let untouched = self.density == Density::Auto && self.mode == 1 && self.ecc == 1 && self.fps == 12;
            if untouched {
                let now = Prefs::for_platform(platform);
                (self.density, self.mode, self.ecc, self.fps) = (now.density, now.mode, now.ecc, now.fps);
            }
            self.defaults = DEFAULTS;
        }
        self
    }

    /// Stored values are checked, never trusted.
    fn sanitized(mut self) -> Prefs {
        if !(1..=2).contains(&self.mode) {
            self.mode = 1;
        }
        self.ecc = self.ecc.min(2);
        self.fps = self.fps.clamp(MIN_FPS, FPS_CEILING);
        self.reader.font = self.reader.font.clamp(-4, 8);
        self
    }
}

/// [`Prefs`] as stored: without `defaults`, they date from before the field existed.
struct StoredPrefs(Prefs);

impl<'de> Deserialize<'de> for StoredPrefs {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let v = serde_json::Value::deserialize(d)?;
        let dated = v.get("defaults").is_some();
        let mut p: Prefs = serde_json::from_value(v).map_err(serde::de::Error::custom)?;
        if !dated {
            p.defaults = 0;
        }
        Ok(StoredPrefs(p))
    }
}

pub const MIN_FPS: u32 = 4;
/// The frame rate a sender offers when its screen has not said how fast it refreshes.
pub const DEFAULT_MAX_FPS: u32 = 60;
/// The protocol's own limit, whatever the screen: the frame number has 8 bits and names a
/// frame for one second (PROTOCOL §11.5), so a second must hold fewer than 256 frames.
pub const FPS_CEILING: u32 = 240;

/// The fastest a sender can play: one frame per refresh of its screen. Nothing else is fixed —
/// a faster screen raises it, and the receiver's camera follows as far as it can.
pub fn max_fps(refresh_hz: f64) -> u32 {
    if refresh_hz.is_finite() && refresh_hz >= 1.0 {
        (refresh_hz.round() as u32).clamp(MIN_FPS, FPS_CEILING)
    } else {
        DEFAULT_MAX_FPS
    }
}

/// The capture rates a receiver steps through, up to what its camera offers: 30 and its
/// doublings, and the camera's own top rate when that is none of them (90, 144).
fn capture_rates(camera_max: u32) -> Vec<u32> {
    let top = camera_max.max(30);
    let mut rates: Vec<u32> = std::iter::successors(Some(30u32), |r| r.checked_mul(2)).take_while(|&r| r <= top).collect();
    if rates.last() != Some(&top) {
        rates.push(top);
    }
    rates
}

/// The sender rate from which a capture rate is worth its power: a little over a quarter of
/// it, so that each sender frame gets about two captures and up to four.
fn capture_from(rate: u32) -> f32 {
    if rate <= 30 {
        0.0
    } else {
        rate as f32 * 16.0 / 60.0
    }
}
/// The dock hides itself after this long without a touch while the code plays.
pub const DOCK_IDLE_MS: u32 = 2600;
/// Dashboard refresh while scanning (numbers that age: status, speed).
pub const TICK_MS: u32 = 500;
/// A code counts as in view for this long after the last scan that found it.
pub const FOUND_MS: f64 = 700.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Step {
    Loaded,
    Prepared,
    Started,
    Adjusted,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TimerKind {
    Dock,
    Tick,
    Copied,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FileAction {
    Pick,
    Save,
    Share,
    Open,
    Copy,
    PickImage,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum Event {
    // ---- from the shell
    /// App launch: the system language and the platform.
    Start { locale: String, platform: Platform },
    Navigate { screen: Screen },
    ToggleLang,
    /// The space the sender's code may use (device pixels, safe area removed), and how many
    /// times a second the screen refreshes (0: unknown).
    Viewport {
        width_px: f64,
        height_px: f64,
        scale: f64,
        mm_per_px: f64,
        #[serde(default)]
        refresh_hz: f64,
    },
    /// The app went to the background (or came back).
    AppActive { active: bool },
    /// The device's thermal state: 0 nominal, 1 fair, 2 serious, 3 critical.
    Thermal { level: u8 },
    SourceTab { tab: SourceTab },
    TextChanged { text: String },
    PickFile,
    SendText,
    SetDensity { value: Density },
    SetMode { value: u8 },
    SetEcc { value: u8 },
    SetFps { value: u32 },
    TogglePlay,
    /// The photosensitivity warning was read: play, and don't ask again.
    AcceptFlash,
    ToggleSettings,
    /// A tap on the code: toggles the dock.
    TapCode,
    HideDock,
    ShowDock,
    /// A touch inside the dock: restart its idle timer.
    DockActivity,
    CloseSend,
    OpenCamera,
    SwitchCamera,
    SetZoom { level: f32 },
    ResetZoom,
    PickImage,
    ReceiveAnother,
    Copy,
    OpenLink,
    Save,
    Share,
    OpenFile,
    OpenSettings,
    SetJsonView { pretty: bool },
    ToggleWrap,
    SetFont { delta: i32 },
    ToggleStats,

    // ---- from the runtime and from answered operations (never on the wire)
    #[serde(skip)]
    PrefsLoaded(ShellOutput),
    #[serde(skip)]
    SourceLoaded { name: String, size: u64, text: Option<String> },
    #[serde(skip)]
    SourceFailed { message: String },
    #[serde(skip)]
    Engine { step: Step, attempt: u64, out: EngineOutput },
    #[serde(skip)]
    CameraAnswer { attempt: u64, out: ShellOutput },
    #[serde(skip)]
    Finished { action: FileAction, out: ShellOutput },
    #[serde(skip)]
    Scanned(Box<ScanReport>),
    #[serde(skip)]
    ImageScanned { generation: u64, found: bool, at: f64 },
    #[serde(skip)]
    Progress { fact: ProgressFact, at: f64 },
    #[serde(skip)]
    Received { generation: u64, name: String, size: u64, classified: Classified, at: f64 },
    #[serde(skip)]
    ChecksumError { generation: u64, at: f64 },
    #[serde(skip)]
    SenderStats { build_ms: f64 },
    #[serde(skip)]
    Timer { kind: TimerKind, attempt: u64, out: EngineOutput },
}

#[effect]
pub enum Effect {
    Render(RenderOperation),
    Shell(ShellOp),
    Engine(EngineOp),
}

pub(crate) struct SourceMeta {
    pub name: String,
    pub size: u64,
    /// The text, for a message typed on the sender (label only).
    pub text: Option<String>,
}

#[derive(Default)]
pub(crate) struct SendState {
    pub phase: SendPhase,
    pub text: String,
    pub source: Option<SourceMeta>,
    pub info: Option<SenderInfo>,
    pub geometry: Option<Geometry>,
    /// Bumps whenever the shell must fetch a new mask / layout.
    pub frame_rev: u64,
    pub playing: bool,
    pub settings_open: Option<bool>,
    pub dock_visible: bool,
    pub dock_attempt: u64,
    pub build_ms: f64,
    pub error: Option<String>,
    pub attempt: u64,
}

#[derive(Default)]
pub(crate) struct CameraState {
    pub on: bool,
    pub starting: bool,
    pub error: Option<(CameraError, String)>,
    pub zoom_min: f32,
    pub zoom_max: f32,
    pub zoom: f32,
    pub devices: u32,
    pub device: u32,
    /// Capture mode in force, and what the camera offers.
    pub fps: u32,
    pub max_fps: u32,
    pub uhd: bool,
    pub uhd_ok: bool,
    /// When the mode last changed (a new mode needs time to show its effect).
    pub mode_at: f64,
    /// The exposure limit last sent (µs; 0: none yet).
    pub exposure_us: u32,
    /// Restart when the app returns to the foreground / after "receive another".
    pub resume: bool,
    pub attempt: u64,
}

pub(crate) struct DoneState {
    pub name: String,
    pub size: u64,
    pub secs: f64,
    pub classified: Classified,
    pub stats: Option<ScanReport>,
    pub received: u32,
    pub t: u32,
    pub copied: bool,
    pub copied_attempt: u64,
    pub note: Option<(bool, &'static str)>,
    pub content_rev: u64,
}

pub(crate) struct RecvState {
    pub phase: RecvPhase,
    pub generation: u64,
    pub camera: CameraState,
    pub last: Option<ScanReport>,
    pub progress: Option<ProgressFact>,
    pub prog_hist: VecDeque<(f64, u32)>,
    pub first_packet_at: f64,
    pub active_tid: Option<u16>,
    pub checksum_until: f64,
    pub milestone: u8,
    pub found: bool,
    /// The share of codewords that decodes, over some ten seconds (negative: none yet). With
    /// one capture per sender frame it swings with the phase between the two clocks, and
    /// advice must not swing with it.
    pub ok_slow: f32,
    pub lost_at: f64,
    pub done: Option<DoneState>,
    /// A one-line note on the start screen (e.g. no code in the chosen image).
    pub note: Option<&'static str>,
    pub tick_attempt: u64,
    pub ticking: bool,
    pub from_image: bool,
}

impl Default for RecvState {
    fn default() -> Self {
        RecvState {
            phase: RecvPhase::default(),
            generation: 0,
            camera: CameraState::default(),
            last: None,
            progress: None,
            prog_hist: VecDeque::new(),
            first_packet_at: 0.0,
            active_tid: None,
            checksum_until: 0.0,
            milestone: 0,
            found: false,
            ok_slow: -1.0,
            lost_at: 0.0,
            done: None,
            note: None,
            tick_attempt: 0,
            ticking: false,
            from_image: false,
        }
    }
}

#[derive(Default)]
pub(crate) struct DeviceState {
    pub awake: bool,
    pub bright: bool,
    pub immersive: bool,
}

#[derive(Default)]
pub struct Model {
    pub(crate) started: bool,
    pub(crate) platform: Platform,
    pub(crate) lang: Lang,
    pub(crate) screen: Screen,
    pub(crate) prefs: Prefs,
    pub(crate) viewport: Viewport,
    /// Refreshes per second of the sender's screen (0: not known).
    pub(crate) refresh_hz: f64,
    pub(crate) now: f64,
    pub(crate) send: SendState,
    pub(crate) recv: RecvState,
    pub(crate) device: DeviceState,
    pub(crate) thermal: u8,
    pub(crate) rev: u64,
}

#[derive(Default)]
pub struct Lumen;

type Cmd = Command<Effect, Event>;

fn notify(op: ShellOp) -> Cmd {
    Command::notify_shell(op).build()
}

fn haptic(kind: HapticKind) -> Cmd {
    notify(ShellOp::Haptic { kind })
}

fn engine(op: EngineOp, step: Step, attempt: u64) -> Cmd {
    Command::request_from_shell(op).then_send(move |out| Event::Engine { step, attempt, out })
}

fn timer(kind: TimerKind, attempt: u64, ms: u32) -> Cmd {
    Command::request_from_shell(EngineOp::Delay { ms }).then_send(move |out| Event::Timer { kind, attempt, out })
}

fn engine_notify(op: EngineOp) -> Cmd {
    Command::notify_shell(op).build()
}

fn save_prefs(model: &Model) -> Cmd {
    match serde_json::to_string(&model.prefs) {
        Ok(json) => notify(ShellOp::SavePrefs { json }),
        Err(_) => Command::done(),
    }
}

impl App for Lumen {
    type Event = Event;
    type Model = Model;
    type ViewModel = ViewModel;
    type Effect = Effect;

    fn update(&self, event: Event, model: &mut Model) -> Cmd {
        let cmd = update(event, model);
        let device = sync_device(model);
        model.rev += 1;
        Command::all([cmd, device, render()])
    }

    fn view(&self, model: &Model) -> ViewModel {
        view::view(model)
    }
}

/// Screen on, brightness and system bars follow what is on screen.
fn sync_device(model: &mut Model) -> Cmd {
    let showing_code = model.screen == Screen::Send && model.send.phase == SendPhase::Ready;
    let scanning = model.screen == Screen::Receive && model.recv.phase == RecvPhase::Scanning;
    let awake = showing_code || scanning;
    let bright = showing_code && model.platform.mobile();
    let immersive = showing_code;
    let mut cmds = Vec::new();
    if awake != model.device.awake {
        model.device.awake = awake;
        cmds.push(notify(ShellOp::KeepAwake { on: awake }));
    }
    if bright != model.device.bright {
        model.device.bright = bright;
        cmds.push(notify(ShellOp::Brightness { boost: bright }));
    }
    if immersive != model.device.immersive {
        model.device.immersive = immersive;
        cmds.push(notify(ShellOp::Immersive { on: immersive }));
    }
    Command::all(cmds)
}

fn update(event: Event, model: &mut Model) -> Cmd {
    match event {
        Event::Start { locale, platform } => {
            if model.started {
                return Command::done();
            }
            model.started = true;
            model.platform = platform;
            model.prefs = Prefs::for_platform(platform);
            model.lang = Lang::from_tag(&locale);
            Command::request_from_shell(ShellOp::LoadPrefs).then_send(Event::PrefsLoaded)
        }
        Event::PrefsLoaded(out) => {
            if let ShellOutput::Prefs { json: Some(json) } = out {
                // (a field missing from stored JSON reads as 0: older than every default)
                if let Ok(p) = serde_json::from_str::<StoredPrefs>(&json) {
                    model.prefs = p.0.migrated(model.platform).sanitized();
                    if let Some(l) = model.prefs.lang {
                        model.lang = l;
                    }
                }
            }
            Command::done()
        }
        Event::Navigate { screen } => navigate(model, screen),
        Event::ToggleLang => {
            model.lang = model.lang.toggled();
            model.prefs.lang = Some(model.lang);
            save_prefs(model)
        }
        Event::Viewport { width_px, height_px, scale, mm_per_px, refresh_hz } => {
            // (the refresh rate is no part of the grid: a change of it alone redraws the bar)
            if refresh_hz.is_finite() && refresh_hz >= 0.0 {
                model.refresh_hz = refresh_hz;
            }
            let vp = Viewport { width_px, height_px, scale, mm_per_px };
            if vp == model.viewport || width_px < 50.0 || height_px < 50.0 {
                return Command::done();
            }
            model.viewport = vp;
            regrid(model)
        }
        Event::Thermal { level } => {
            model.thermal = level.min(3);
            let heat = engine_notify(EngineOp::Heat { level: model.thermal });
            // Only at the critical level: the fast capture modes go (they cost the most), before
            // the system stops the camera itself. A phone that is merely warm keeps its rate.
            let cam = &mut model.recv.camera;
            if model.thermal >= 3 && cam.on && cam.fps > 60 {
                cam.fps = 60;
                cam.mode_at = model.now;
                return Command::all([heat, notify(ShellOp::CameraMode { fps: 60, uhd: cam.uhd })]);
            }
            heat
        }
        Event::AppActive { active } => {
            let cam = &mut model.recv.camera;
            if !active && (cam.on || cam.starting) {
                cam.on = false;
                cam.starting = false;
                cam.resume = true;
                return Command::all([notify(ShellOp::CameraStop), engine_notify(EngineOp::RecvActive { on: false })]);
            }
            if active && cam.resume && model.screen == Screen::Receive && model.recv.phase != RecvPhase::Done {
                cam.resume = false;
                return start_camera(model);
            }
            Command::done()
        }

        // ------------------------------------------------------------------ send
        Event::SourceTab { tab } => {
            model.prefs.source = tab;
            save_prefs(model)
        }
        Event::TextChanged { text } => {
            model.send.text = text;
            Command::done()
        }
        Event::PickFile => Command::request_from_shell(ShellOp::PickFile).then_send(move |out| Event::Finished { action: FileAction::Pick, out }),
        Event::SendText => {
            if model.send.text.is_empty() || model.send.phase != SendPhase::Pick {
                return Command::done();
            }
            model.send.attempt += 1;
            engine(EngineOp::LoadText { text: model.send.text.clone() }, Step::Loaded, model.send.attempt)
        }
        Event::SourceLoaded { name, size, text } => {
            model.screen = Screen::Send;
            source_loaded(model, name, size, text)
        }
        Event::SourceFailed { message } => {
            model.send.error = Some(message);
            model.send.phase = SendPhase::Pick;
            haptic(HapticKind::Error)
        }
        Event::Engine { step, attempt, out } => engine_answer(model, step, attempt, out),
        Event::SenderStats { build_ms } => {
            model.send.build_ms = build_ms;
            Command::done()
        }
        Event::SetDensity { value } => {
            if model.prefs.density == value {
                return Command::done();
            }
            model.prefs.density = value;
            Command::all([save_prefs(model), haptic(HapticKind::Selection), poke_dock(model), regrid(model)])
        }
        Event::SetMode { value } => {
            if !(1..=2).contains(&value) || model.prefs.mode == value {
                return Command::done();
            }
            model.prefs.mode = value;
            Command::all([save_prefs(model), haptic(HapticKind::Selection), poke_dock(model), reconfigure(model)])
        }
        Event::SetEcc { value } => {
            if value > 2 || model.prefs.ecc == value {
                return Command::done();
            }
            model.prefs.ecc = value;
            Command::all([save_prefs(model), haptic(HapticKind::Selection), poke_dock(model), reconfigure(model)])
        }
        Event::SetFps { value } => {
            let v = value.clamp(MIN_FPS, max_fps(model.refresh_hz));
            if v == model.prefs.fps {
                return Command::done();
            }
            model.prefs.fps = v;
            Command::all([save_prefs(model), haptic(HapticKind::Selection), poke_dock(model)])
        }
        Event::TogglePlay | Event::AcceptFlash if !model.prefs.flash_ok => {
            if model.send.phase != SendPhase::Ready {
                return Command::done();
            }
            model.prefs.flash_ok = true;
            model.send.playing = true;
            Command::all([save_prefs(model), haptic(HapticKind::Light), show_dock(model)])
        }
        Event::AcceptFlash => Command::done(),
        Event::TogglePlay => {
            if model.send.phase != SendPhase::Ready {
                return Command::done();
            }
            model.send.playing = !model.send.playing;
            Command::all([haptic(HapticKind::Light), show_dock(model)])
        }
        Event::ToggleSettings => {
            let open = !settings_open(model);
            model.send.settings_open = Some(open);
            poke_dock(model)
        }
        // The control bar is permanent and never covers the code (the shell lays the code out
        // above it), so there is nothing to hide; these events remain for older shells.
        Event::TapCode | Event::HideDock => Command::done(),
        Event::ShowDock => show_dock(model),
        Event::DockActivity => poke_dock(model),
        Event::CloseSend => close_send(model),

        // ------------------------------------------------------------------ receive
        Event::OpenCamera => {
            model.recv.note = None;
            start_camera(model)
        }
        Event::CameraAnswer { attempt, out } => camera_answer(model, attempt, out),
        Event::SwitchCamera => {
            let cam = &mut model.recv.camera;
            if cam.devices < 2 || !cam.on {
                return Command::done();
            }
            cam.device = (cam.device + 1) % cam.devices;
            Command::all([haptic(HapticKind::Light), start_camera(model)])
        }
        Event::SetZoom { level } => {
            let cam = &mut model.recv.camera;
            if !cam.on || cam.zoom_max <= cam.zoom_min || !level.is_finite() {
                return Command::done();
            }
            let z = level.clamp(cam.zoom_min, cam.zoom_max);
            if (z - cam.zoom).abs() < 0.005 {
                return Command::done();
            }
            cam.zoom = z;
            notify(ShellOp::CameraZoom { level: z })
        }
        Event::ResetZoom => {
            let cam = &mut model.recv.camera;
            if !cam.on {
                return Command::done();
            }
            cam.zoom = cam.zoom_min;
            Command::all([notify(ShellOp::CameraZoom { level: cam.zoom_min }), haptic(HapticKind::Selection)])
        }
        Event::PickImage => {
            model.recv.note = None;
            Command::request_from_shell(ShellOp::PickImage).then_send(move |out| Event::Finished { action: FileAction::PickImage, out })
        }
        Event::ImageScanned { generation, found, at } => {
            if generation != model.recv.generation {
                return Command::done();
            }
            model.now = at;
            if !found {
                if model.recv.phase == RecvPhase::Start {
                    model.recv.note = Some("imageNoCode");
                }
                return haptic(HapticKind::Warning);
            }
            if model.recv.phase == RecvPhase::Start {
                model.recv.phase = RecvPhase::Scanning;
                model.recv.from_image = true;
                return start_tick(model);
            }
            Command::done()
        }
        Event::Scanned(report) => scanned(model, *report),
        Event::Progress { fact, at } => progress(model, fact, at),
        Event::Received { generation, name, size, classified, at } => received(model, generation, name, size, classified, at),
        Event::ChecksumError { generation, at } => {
            if generation != model.recv.generation {
                return Command::done();
            }
            model.now = at;
            model.recv.checksum_until = at + 3000.0;
            haptic(HapticKind::Warning)
        }
        Event::Timer { kind, attempt, out } => {
            if let EngineOutput::Elapsed { now } = out {
                model.now = model.now.max(now);
            }
            match kind {
                TimerKind::Dock => {
                    if attempt == model.send.dock_attempt && model.send.playing && model.send.phase == SendPhase::Ready && model.send.settings_open != Some(true) {
                        model.send.dock_visible = false;
                    }
                    Command::done()
                }
                TimerKind::Tick => {
                    if attempt != model.recv.tick_attempt || model.recv.phase != RecvPhase::Scanning || model.screen != Screen::Receive {
                        model.recv.ticking = false;
                        return Command::done();
                    }
                    timer(TimerKind::Tick, attempt, TICK_MS)
                }
                TimerKind::Copied => {
                    if let Some(d) = &mut model.recv.done {
                        if d.copied_attempt == attempt {
                            d.copied = false;
                        }
                    }
                    Command::done()
                }
            }
        }
        Event::ReceiveAnother => receive_another(model),
        Event::Copy => {
            let pretty = model.prefs.reader.pretty;
            match &model.recv.done {
                Some(d) if matches!(d.classified.kind, Kind::Message | Kind::Text | Kind::Json) => {
                    Command::request_from_shell(ShellOp::CopyText { pretty }).then_send(move |out| Event::Finished { action: FileAction::Copy, out })
                }
                _ => Command::done(),
            }
        }
        Event::OpenLink => match model.recv.done.as_ref().and_then(|d| d.classified.link.clone()) {
            Some(url) => notify(ShellOp::OpenUrl { url }),
            None => Command::done(),
        },
        Event::Save | Event::Share | Event::OpenFile => {
            let Some(d) = &model.recv.done else { return Command::done() };
            let (name, mime) = (d.name.clone(), d.classified.mime.clone());
            let (op, action) = match event {
                Event::Save => (ShellOp::SaveFile { name, mime }, FileAction::Save),
                Event::Share => (ShellOp::ShareFile { name, mime }, FileAction::Share),
                _ => (ShellOp::OpenFile { name, mime }, FileAction::Open),
            };
            Command::request_from_shell(op).then_send(move |out| Event::Finished { action, out })
        }
        Event::OpenSettings => notify(ShellOp::OpenSettings),
        Event::Finished { action, out } => finished(model, action, out),
        Event::SetJsonView { pretty } => {
            if model.prefs.reader.pretty == pretty {
                return Command::done();
            }
            model.prefs.reader.pretty = pretty;
            bump_content(model);
            Command::all([save_prefs(model), haptic(HapticKind::Selection)])
        }
        Event::ToggleWrap => {
            model.prefs.reader.wrap = !model.prefs.reader.wrap;
            save_prefs(model)
        }
        Event::SetFont { delta } => {
            let f = (model.prefs.reader.font + delta.signum()).clamp(-4, 8);
            if f == model.prefs.reader.font {
                return Command::done();
            }
            model.prefs.reader.font = f;
            save_prefs(model)
        }
        Event::ToggleStats => {
            let open = !stats_open(model);
            model.prefs.reader.stats = Some(open);
            save_prefs(model)
        }
    }
}

// ---------------------------------------------------------------------- navigation

fn navigate(model: &mut Model, screen: Screen) -> Cmd {
    if screen == model.screen {
        return Command::done();
    }
    let mut cmds = Vec::new();
    match model.screen {
        Screen::Send if model.send.phase != SendPhase::Pick => cmds.push(close_send(model)),
        Screen::Receive => cmds.push(leave_receive(model)),
        _ => {}
    }
    model.screen = screen;
    Command::all(cmds)
}

fn leave_receive(model: &mut Model) -> Cmd {
    // a received file is kept until "receive another": leaving must not lose it
    if model.recv.phase == RecvPhase::Done {
        return Command::done();
    }
    let mut cmds = Vec::new();
    let cam = &mut model.recv.camera;
    if cam.on || cam.starting {
        cmds.push(notify(ShellOp::CameraStop));
    }
    cam.on = false;
    cam.starting = false;
    cam.resume = false;
    cam.attempt += 1;
    cam.error = None;
    let generation = model.recv.generation + 1;
    let camera = std::mem::take(&mut model.recv.camera);
    model.recv = RecvState { generation, camera, ..RecvState::default() };
    cmds.push(engine_notify(EngineOp::RecvActive { on: false }));
    cmds.push(engine_notify(EngineOp::ResetRecv { generation }));
    Command::all(cmds)
}

// ---------------------------------------------------------------------- send

fn settings_open(model: &Model) -> bool {
    model.send.settings_open.unwrap_or(false)
}

fn source_loaded(model: &mut Model, name: String, size: u64, text: Option<String>) -> Cmd {
    let s = &mut model.send;
    s.attempt += 1;
    s.phase = SendPhase::Preparing;
    s.error = None;
    s.info = None;
    s.source = Some(SourceMeta { name, size, text });
    engine(EngineOp::Prepare, Step::Prepared, s.attempt)
}

fn engine_answer(model: &mut Model, step: Step, attempt: u64, out: EngineOutput) -> Cmd {
    if attempt != model.send.attempt {
        return Command::done(); // superseded (closed, or a newer file)
    }
    match (step, out) {
        (Step::Loaded, EngineOutput::Loaded { name, size }) => {
            let text = Some(model.send.text.clone());
            model.screen = Screen::Send;
            source_loaded(model, name, size, text)
        }
        (Step::Prepared, EngineOutput::Prepared { ok: true, .. }) => {
            let g = geometry::compute(&model.viewport, model.prefs.density);
            model.send.geometry = Some(g);
            let op = EngineOp::StartSender { mode: model.prefs.mode, ecc: model.prefs.ecc, geometry: g, keep_tid: false };
            engine(op, Step::Started, attempt)
        }
        (Step::Started | Step::Adjusted, EngineOutput::Sender(info)) if info.ok => {
            let first = step == Step::Started;
            model.send.info = Some(info);
            model.send.frame_rev += 1;
            model.send.phase = SendPhase::Ready;
            // the screen may have changed while the sender was being built (a resize during
            // preparation or during the last resize): lay the code out for the screen as it is now
            let fit = regrid(model);
            if first {
                // every path to a playing code (pick, text, a file opened from another app)
                // passes here: the first time, the code waits for the warning to be read
                model.send.playing = model.prefs.flash_ok;
                Command::all([haptic(HapticKind::Medium), show_dock(model), fit])
            } else {
                fit
            }
        }
        (_, EngineOutput::Prepared { ok: false, .. }) | (_, EngineOutput::Sender(_)) => {
            model.send.phase = SendPhase::Pick;
            model.send.error = Some(crate::i18n::t(model.lang, "readFailed").to_string());
            model.send.source = None;
            haptic(HapticKind::Error)
        }
        _ => Command::done(),
    }
}

/// The screen or the density changed: same stream on a new grid.
fn regrid(model: &mut Model) -> Cmd {
    if model.send.phase != SendPhase::Ready {
        return Command::done();
    }
    let g = geometry::compute(&model.viewport, model.prefs.density);
    if Some(g) == model.send.geometry {
        return Command::done();
    }
    model.send.geometry = Some(g);
    engine(EngineOp::Resize { geometry: g }, Step::Adjusted, model.send.attempt)
}

/// Colours or ECC changed: keep the transfer when the packet size allows it.
fn reconfigure(model: &mut Model) -> Cmd {
    if model.send.phase != SendPhase::Ready {
        return Command::done();
    }
    let g = geometry::compute(&model.viewport, model.prefs.density);
    model.send.geometry = Some(g);
    engine(EngineOp::Reconfigure { mode: model.prefs.mode, ecc: model.prefs.ecc, geometry: g }, Step::Adjusted, model.send.attempt)
}

fn close_send(model: &mut Model) -> Cmd {
    let s = &mut model.send;
    s.attempt += 1;
    s.dock_attempt += 1;
    s.phase = SendPhase::Pick;
    s.source = None;
    s.info = None;
    s.geometry = None;
    s.playing = false;
    s.error = None;
    engine_notify(EngineOp::StopSender)
}

fn show_dock(model: &mut Model) -> Cmd {
    model.send.dock_visible = true;
    poke_dock(model)
}

/// The bar no longer hides itself; kept as the one place to change if that ever returns.
fn poke_dock(_model: &mut Model) -> Cmd {
    Command::done()
}

// ---------------------------------------------------------------------- receive

fn start_camera(model: &mut Model) -> Cmd {
    let cam = &mut model.recv.camera;
    cam.attempt += 1;
    cam.starting = true;
    cam.error = None;
    let attempt = cam.attempt;
    Command::request_from_shell(ShellOp::CameraStart { device: cam.device }).then_send(move |out| Event::CameraAnswer { attempt, out })
}

fn camera_answer(model: &mut Model, attempt: u64, out: ShellOutput) -> Cmd {
    if attempt != model.recv.camera.attempt || model.screen != Screen::Receive {
        // the person left (or asked again) while the camera was opening
        if let ShellOutput::Camera { ok: true, .. } = out {
            if !model.recv.camera.on {
                return notify(ShellOp::CameraStop);
            }
        }
        return Command::done();
    }
    let cam = &mut model.recv.camera;
    cam.starting = false;
    match out {
        ShellOutput::Camera { ok: true, zoom_min, zoom_max, zoom, devices, max_fps, uhd, .. } => {
            cam.on = true;
            cam.fps = 30;
            cam.max_fps = max_fps;
            cam.uhd = false;
            cam.uhd_ok = uhd;
            cam.mode_at = model.now;
            cam.exposure_us = 0;
            cam.zoom_min = zoom_min;
            cam.zoom_max = zoom_max.max(zoom_min);
            // a restarted camera keeps the level the person chose
            cam.zoom = if cam.zoom > 0.0 { cam.zoom.clamp(cam.zoom_min, cam.zoom_max) } else { zoom };
            cam.devices = devices.max(1);
            cam.device %= cam.devices;
            let z = cam.zoom;
            let rezoom = (z - zoom).abs() > 0.01;
            model.recv.phase = RecvPhase::Scanning;
            model.recv.from_image = false;
            let mut cmds = vec![engine_notify(EngineOp::RecvEager { on: !model.platform.mobile() }), engine_notify(EngineOp::RecvActive { on: true }), start_tick(model)];
            if rezoom {
                cmds.push(notify(ShellOp::CameraZoom { level: z }));
            }
            Command::all(cmds)
        }
        ShellOutput::Camera { error, message, .. } => {
            cam.on = false;
            let kind = error.unwrap_or(CameraError::Failed);
            cam.error = Some((kind, message.unwrap_or_default()));
            if model.recv.phase == RecvPhase::Scanning && !model.recv.from_image {
                model.recv.phase = RecvPhase::Start;
            }
            haptic(HapticKind::Error)
        }
        _ => Command::done(),
    }
}

fn start_tick(model: &mut Model) -> Cmd {
    if model.recv.ticking {
        return Command::done();
    }
    model.recv.ticking = true;
    model.recv.tick_attempt += 1;
    timer(TimerKind::Tick, model.recv.tick_attempt, TICK_MS)
}

fn scanned(model: &mut Model, report: ScanReport) -> Cmd {
    if report.generation != model.recv.generation || model.recv.phase == RecvPhase::Done {
        return Command::done();
    }
    model.now = model.now.max(report.at);
    let r = &mut model.recv;
    let mut cmd = Command::done();
    // The capture mode follows the code. Frame rate: each sender frame needs about two
    // captures, so the camera runs at the lowest of its rates that gives that (a fast
    // mode also reads the sensor out faster: fewer torn frames). 4K for small cells (4:2:0
    // colour at 1080p gives a 5-pixel cell 2.5 colour pixels and neighbours bleed; at 5 px it
    // gains nothing measurable and only costs power, so only genuinely tiny cells qualify).
    // Wide hysteresis (the estimate of a 12 fps sender jitters around 12–14), and two seconds
    // for a new mode to settle.
    let sender = report.stats.sender_fps;
    if report.stats.cov_tot > 0 {
        let now = report.stats.cov_ok as f32 / report.stats.cov_tot as f32;
        let last = r.last.as_ref().map_or(report.at, |l| l.at);
        let w = (((report.at - last) / 8000.0) as f32).clamp(0.0, 1.0);
        r.ok_slow = if r.ok_slow < 0.0 { now } else { r.ok_slow + w * (now - r.ok_slow) };
    }
    let hot = model.thermal >= 3;
    let cam = &mut r.camera;
    if cam.on && report.at - cam.mode_at > 2000.0 {
        let mut fps = cam.fps;
        // at the critical level the fast modes go, before iOS/Android stop the camera
        let max_fps = if hot { cam.max_fps.min(60) } else { cam.max_fps };
        if sender > 0.0 {
            let rates = capture_rates(max_fps);
            let cur = rates.iter().position(|&r| r == fps).unwrap_or(0);
            let mut band = cur;
            while band + 1 < rates.len() && sender >= capture_from(rates[band + 1]) {
                band += 1;
            }
            while band > 0 && sender < capture_from(rates[band]) - 3.0 {
                band -= 1;
            }
            fps = rates[band];
        }
        let mut uhd = cam.uhd;
        let cell = report.stats.cell as f64;
        if report.stats.cell_n >= 3 && report.ok {
            if !uhd && cam.uhd_ok && cell < 4.2 {
                uhd = true;
            } else if uhd && cell > 16.0 {
                uhd = false;
            }
        }
        // a fast sender needs captures more than resolution (4K stops at 60 fps on most phones)
        if fps > 60 {
            uhd = false;
        }
        if (fps, uhd) != (cam.fps, cam.uhd) {
            cam.fps = fps;
            cam.uhd = uhd;
            cam.mode_at = report.at;
            cmd = notify(ShellOp::CameraMode { fps, uhd });
        }
    }
    // Exposure: at most a sixteenth of the sender's frame, in steps. While the shutter is open
    // across a frame change the capture holds a blend of two frames, and a screen takes a few
    // milliseconds over each change as it is; a longer exposure only widens that band. The
    // gain that a short exposure needs costs less (measured at 60 frames a second: 1/1000 s
    // decodes a seventh more of each capture than 1/500 s, at twice the gain).
    if cam.on && sender > 0.0 && report.stats.span_secs > 1.0 {
        let fit = 1_000_000.0 / sender as f64 / 16.0;
        let max_us = [8000u32, 4000, 2000, 1000].into_iter().find(|&b| b as f64 <= fit).unwrap_or(500);
        if max_us != cam.exposure_us {
            cam.exposure_us = max_us;
            cmd = Command::all([cmd, notify(ShellOp::CameraExposure { max_us })]);
        }
    }
    if report.ok {
        // a code came into view after a while without one
        if !r.found && report.at - r.lost_at > 1500.0 {
            cmd = Command::all([cmd, haptic(HapticKind::Light)]);
        }
        r.found = true;
    } else if r.found && report.at - report.stats.last_found_at > FOUND_MS {
        r.found = false;
        r.lost_at = report.at;
    }
    r.last = Some(report);
    cmd
}

fn progress(model: &mut Model, fact: ProgressFact, at: f64) -> Cmd {
    if fact.generation != model.recv.generation || model.recv.phase == RecvPhase::Done {
        return Command::done();
    }
    model.now = model.now.max(at);
    let r = &mut model.recv;
    if r.active_tid != Some(fact.tid) {
        r.active_tid = Some(fact.tid);
        r.prog_hist.clear();
        r.first_packet_at = at;
        r.milestone = 0;
    }
    if r.first_packet_at <= 0.0 {
        r.first_packet_at = at;
    }
    r.prog_hist.push_back((at, fact.received));
    while r.prog_hist.len() > 2 && at - r.prog_hist[0].0 > 3000.0 {
        r.prog_hist.pop_front();
    }
    let quarter = match fact.needed {
        Some(n) if n > 0 => ((4 * fact.received as u64) / n as u64).min(3) as u8,
        _ => 0,
    };
    r.progress = Some(fact);
    if quarter > r.milestone {
        r.milestone = quarter;
        return haptic(HapticKind::Selection);
    }
    Command::done()
}

fn received(model: &mut Model, generation: u64, name: String, size: u64, classified: Classified, at: f64) -> Cmd {
    if generation != model.recv.generation || model.recv.phase == RecvPhase::Done {
        return Command::done();
    }
    model.now = model.now.max(at);
    let r = &mut model.recv;
    let secs = if r.first_packet_at > 0.0 { (at - r.first_packet_at) / 1000.0 } else { 0.0 };
    let (received, t) = r.progress.as_ref().map_or((0, 0), |p| (p.received, p.t));
    r.done = Some(DoneState {
        name,
        size,
        secs,
        classified,
        stats: r.last.clone(),
        received,
        t,
        copied: false,
        copied_attempt: 0,
        note: None,
        content_rev: 1,
    });
    r.phase = RecvPhase::Done;
    r.ticking = false;
    r.tick_attempt += 1;
    // the camera is not needed while the result is on screen: power, heat
    let cam = &mut r.camera;
    let was_on = cam.on || cam.starting;
    cam.resume = was_on;
    cam.on = false;
    cam.starting = false;
    cam.attempt += 1;
    let mut cmds = vec![haptic(HapticKind::Success), engine_notify(EngineOp::RecvActive { on: false })];
    if was_on {
        cmds.push(notify(ShellOp::CameraStop));
    }
    Command::all(cmds)
}

fn receive_another(model: &mut Model) -> Cmd {
    let generation = model.recv.generation + 1;
    let resume = model.recv.camera.resume;
    let mut camera = std::mem::take(&mut model.recv.camera);
    camera.resume = false;
    model.recv = RecvState { generation, camera, ..RecvState::default() };
    let mut cmds = vec![engine_notify(EngineOp::ResetRecv { generation })];
    if resume {
        // same camera as before; scanning starts again when it answers
        cmds.push(start_camera(model));
    }
    Command::all(cmds)
}

fn finished(model: &mut Model, action: FileAction, out: ShellOutput) -> Cmd {
    let ShellOutput::Finished { ok, cancelled } = out else { return Command::done() };
    match action {
        FileAction::Copy if ok => {
            if let Some(d) = &mut model.recv.done {
                d.copied = true;
                d.copied_attempt += 1;
                let attempt = d.copied_attempt;
                return Command::all([haptic(HapticKind::Success), timer(TimerKind::Copied, attempt, 1500)]);
            }
            Command::done()
        }
        FileAction::Save => {
            if let Some(d) = &mut model.recv.done {
                if cancelled {
                    d.note = None;
                    return Command::done();
                }
                d.note = Some((ok, if ok { "saved" } else { "saveFailed" }));
                return haptic(if ok { HapticKind::Success } else { HapticKind::Error });
            }
            Command::done()
        }
        FileAction::Pick if !ok && !cancelled => {
            model.send.error = Some(crate::i18n::t(model.lang, "readFailed").to_string());
            haptic(HapticKind::Error)
        }
        _ => Command::done(),
    }
}

fn bump_content(model: &mut Model) {
    if let Some(d) = &mut model.recv.done {
        d.content_rev += 1;
    }
}

fn stats_open(model: &Model) -> bool {
    // folded until asked for: the result screen leads with the file and what to do with it
    model.prefs.reader.stats.unwrap_or(false)
}

#[cfg(test)]
mod tests;
