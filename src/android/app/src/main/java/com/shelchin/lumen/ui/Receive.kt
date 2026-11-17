package com.shelchin.lumen.ui

import android.view.ViewGroup
import android.content.Context
import android.content.res.Configuration
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.view.Surface
import android.view.WindowManager
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.Constraints
import kotlin.math.abs
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.collapse
import androidx.compose.ui.semantics.expand
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.shelchin.lumen.core.AppModel
import com.shelchin.lumen.core.Ev
import com.shelchin.lumen.core.OverlayVM
import com.shelchin.lumen.core.RecvVM
import com.shelchin.lumen.core.ViewModel

/** The receiver (the web's recv.html): start screen, live camera with the dashboard, result. */
@Composable
fun ReceiveScreen(model: AppModel, v: ViewModel) {
    val r = v.recv
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        if (r.cameraOn || r.cameraStarting) {
            val zoom by rememberUpdatedState(r.zoom?.level ?: 1f)
            Box(
                Modifier
                    .fillMaxSize()
                    .pointerInput(Unit) {
                        detectTransformGestures { _, _, scale, _ -> if (scale != 1f) model.dispatch(Ev.zoom(zoom * scale)) }
                    },
            ) {
                AndroidView(
                    factory = { model.camera.previewView.also { (it.parent as? ViewGroup)?.removeView(it) } },
                    modifier = Modifier.fillMaxSize(),
                )
                OutlineLayer(model)
            }
        }
        if (r.phase == "scanning") {
            // A code on a monitor is wide: the phone is turned on its side to fill the picture
            // with it, usually with auto-rotate off. The status and the panel turn with the
            // phone, so that they read upright either way.
            Turned(rememberTilt()) {
                ScanningLayer(model, r)
                TopBar(model, r)
            }
        }
        if (r.phase == "start") StartPane(model, r)
        if (r.phase == "done") r.done?.let { DoneScreen(model, it) }
        if (r.phase == "start") TopBar(model, r)
    }
}

/**
 * The way home and, while scanning, the status. On a wide, low screen (a phone on its side) the
 * bar keeps clear of the corners, which hold the scan frame, and carries the camera tools at
 * its end: there is no room for them above the panel.
 */
@Composable
private fun TopBar(model: AppModel, r: RecvVM) {
    BoxWithConstraints(Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.safeDrawing)) {
        val wide = r.phase == "scanning" && maxWidth > maxHeight
        Row(
            Modifier.fillMaxWidth().padding(horizontal = if (wide) 48.dp else 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            HomeButton(model.t("home")) { model.dispatch(Ev.navigate("home")) }
            if (r.phase == "scanning") Chip {
                StatusDot(r.live)
                Label(r.status, size = 13.sp, weight = FontWeight.SemiBold, lines = 1)
            }
            if (wide && (r.zoom != null || r.canSwitch)) {
                Spacer(Modifier.weight(1f))
                CamTools(model, r)
            }
        }
    }
}

/** Zoom and camera switch. */
@Composable
private fun CamTools(model: AppModel, r: RecvVM) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        r.zoom?.let { z ->
            Box(
                Modifier
                    .clip(CircleShape)
                    .background(Color(0xDB0C1017))
                    .border(1.dp, if (z.active) Lumen.cyan else Lumen.line2, CircleShape)
                    .clickable { model.dispatch(Ev.resetZoom) }
                    .defaultMinSize(minWidth = 48.dp, minHeight = 36.dp)
                    .padding(horizontal = 12.dp),
                contentAlignment = Alignment.Center,
            ) { Text(z.label, style = mono(13.sp, FontWeight.SemiBold), color = Lumen.text) }
        }
        if (r.canSwitch) IconBtn(Icons.switchCamera, model.t("switchCam"), background = Color(0xDB0C1017), size = 48.dp) { model.dispatch(Ev.switchCamera) }
    }
}

/**
 * How the phone is held, read from gravity: it works with auto-rotate off, when the interface
 * itself stays upright. 0: as the interface is; 1 and -1: a quarter turn clockwise /
 * anticlockwise brings the content upright. Only for an interface in its natural, upright
 * position: one that has turned by itself needs nothing added.
 */
@Composable
private fun rememberTilt(): Int {
    val context = LocalContext.current
    val upright = LocalConfiguration.current.orientation == Configuration.ORIENTATION_PORTRAIT
    var quarter by remember { mutableIntStateOf(0) }
    DisposableEffect(upright) {
        val sensors = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        val gravity = sensors?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        val windows = context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager
        val listener = object : SensorEventListener {
            override fun onSensorChanged(e: SensorEvent) {
                // along the screen's axes, in g (x to the right, y up; upright: y = 1)
                val x = e.values[0] / SensorManager.GRAVITY_EARTH
                val y = e.values[1] / SensorManager.GRAVITY_EARTH
                var q = quarter
                if (abs(x) > 0.75f && abs(y) < 0.5f) {
                    q = if (x > 0) 1 else -1 // on its side: the right edge up, or the left
                } else if (y > 0.75f) {
                    q = 0 // upright
                }
                // (flat on a table, upside down, in between: as it was)
                @Suppress("DEPRECATION")
                val turned = (windows?.defaultDisplay?.rotation ?: Surface.ROTATION_0) != Surface.ROTATION_0
                if (!upright || turned) q = 0
                if (q != quarter) quarter = q
            }

            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
        }
        if (gravity != null) sensors.registerListener(listener, gravity, SensorManager.SENSOR_DELAY_UI)
        onDispose {
            sensors?.unregisterListener(listener)
            quarter = 0
        }
    }
    return quarter
}

/**
 * Lays `content` out for the space as it is when the phone is held on its side (width and
 * height exchanged) and turns it a quarter, so that it fills the same space, upright. Turned,
 * the content stays inside the safe area: the cutout and the gesture bar are then at its sides.
 */
@Composable
private fun Turned(quarter: Int, content: @Composable () -> Unit) {
    if (quarter == 0) {
        Box(Modifier.fillMaxSize()) { content() }
        return
    }
    Layout(
        content = { Box(Modifier.graphicsLayer { rotationZ = 90f * quarter }) { content() } },
        modifier = Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing),
    ) { measurables, constraints ->
        val placeable = measurables.first().measure(Constraints.fixed(constraints.maxHeight, constraints.maxWidth))
        layout(constraints.maxWidth, constraints.maxHeight) {
            placeable.place((constraints.maxWidth - placeable.width) / 2, (constraints.maxHeight - placeable.height) / 2)
        }
    }
}

/** The detected code outline, mapped from camera-frame pixels onto the fill-centred preview. */
/** The outline, in its own scope: it changes 20 times a second, the rest of the screen does not. */
@Composable
private fun OutlineLayer(model: AppModel) {
    val o = model.overlay ?: return
    Outline(o, model.camera.mirrored)
}

@Composable
private fun Outline(o: OverlayVM, mirrored: Boolean) {
    val color = when (o.tone) {
        "good" -> Lumen.green
        "fair" -> Lumen.amber
        else -> Lumen.red
    }
    Canvas(Modifier.fillMaxSize()) {
        if (o.points.size != 4 || o.frameW <= 0) return@Canvas
        // the preview and the analysed frames are the same 16:9 stream, shown upright and
        // scaled to fill the view (PreviewView FILL_CENTER)
        val rot = ((o.rotation % 360) + 360) % 360
        val (dw, dh) = if (rot % 180 == 90) o.frameH.toFloat() to o.frameW.toFloat() else o.frameW.toFloat() to o.frameH.toFloat()
        val k = maxOf(size.width / dw, size.height / dh)
        val ox = (size.width - dw * k) / 2
        val oy = (size.height - dh * k) / 2
        fun map(p: List<Float>): Offset {
            val (x, y) = p[0] to p[1]
            val (rx, ry) = when (rot) {
                90 -> (o.frameH - y) to x
                180 -> (o.frameW - x) to (o.frameH - y)
                270 -> y to (o.frameW - x)
                else -> x to y
            }
            val px = ox + rx * k
            return Offset(if (mirrored) size.width - px else px, oy + ry * k)
        }
        val path = Path().apply {
            o.points.forEachIndexed { i, p -> map(p).let { if (i == 0) moveTo(it.x, it.y) else lineTo(it.x, it.y) } }
            close()
        }
        drawPath(path, color.copy(alpha = 0.35f), style = Stroke(width = 9.dp.toPx(), join = StrokeJoin.Round))
        drawPath(path, color, style = Stroke(width = 3.dp.toPx(), join = StrokeJoin.Round))
    }
}

/**
 * While scanning: framing guides over the image until a code is found, the camera tools in a
 * row just above the panel (never over the middle of the image), and the panel at the bottom
 * (bottom right in landscape).
 */
@Composable
private fun ScanningLayer(model: AppModel, r: RecvVM) {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("lumen", Context.MODE_PRIVATE) }
    var details by remember { mutableStateOf(prefs.getBoolean(DETAILS_KEY, false)) }
    BoxWithConstraints(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
        // On its side the screen is wide and low and the code fills it: the panel becomes one
        // line and a bar at the bottom, the camera tools move into the top bar, and the scan
        // frame is the screen's four corners (as on iPhone).
        val landscape = maxWidth > maxHeight
        val dockWidth = if (landscape) minOf(720.dp, maxWidth - 96.dp) else minOf(560.dp, maxWidth - 20.dp)
        var dockHeight by remember { mutableIntStateOf(0) }
        val dockH = with(LocalDensity.current) { dockHeight.toDp() }
        if (!r.live) {
            Guides(
                if (landscape) Modifier.fillMaxSize().padding(6.dp)
                else Modifier.fillMaxSize().padding(top = 62.dp, bottom = dockH + 6.dp + 18.dp, start = 22.dp, end = 22.dp),
            )
        }
        Column(
            Modifier
                .align(Alignment.BottomCenter)
                .padding(vertical = 6.dp)
                .width(dockWidth)
                .onSizeChanged { dockHeight = it.height },
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (!landscape && (r.zoom != null || r.canSwitch)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) { CamTools(model, r) }
            }
            Hud(model, r, details, compact = landscape) {
                details = !details
                prefs.edit().putBoolean(DETAILS_KEY, details).apply()
            }
        }
    }
}

private const val DETAILS_KEY = "recvDetails"

/** Four corner brackets: where to put the code. */
@Composable
private fun Guides(modifier: Modifier) {
    Canvas(modifier) {
        val arm = 30.dp.toPx()
        val rad = 10.dp.toPx()
        val sw = 3.dp.toPx()
        val h = sw / 2
        if (size.width < arm * 2 || size.height < arm * 2) return@Canvas
        val (w, ht) = size.width to size.height
        // each corner: an arm along each edge and a rounded turn
        fun corner(x: Float, y: Float, dx: Float, dy: Float) = Path().apply {
            moveTo(x, y + dy * arm)
            lineTo(x, y + dy * rad)
            quadraticTo(x, y, x + dx * rad, y)
            lineTo(x + dx * arm, y)
        }
        val corners = listOf(corner(h, h, 1f, 1f), corner(w - h, h, -1f, 1f), corner(h, ht - h, 1f, -1f), corner(w - h, ht - h, -1f, -1f))
        for (p in corners) {
            drawPath(p, Color.Black.copy(alpha = 0.35f), style = Stroke(width = sw + 3.dp.toPx(), cap = StrokeCap.Round))
            drawPath(p, Color.White.copy(alpha = 0.75f), style = Stroke(width = sw, cap = StrokeCap.Round))
        }
    }
}

/** `compact` (a wide, low screen): name, speed and percentage on one line over the bar. */
@Composable
private fun Hud(model: AppModel, r: RecvVM, details: Boolean, compact: Boolean = false, toggleDetails: () -> Unit) {
    // no animation: progress already moves 20 times a second, and an animation would redraw
    // the panel on every display frame while receiving
    val progress = r.progress
    Column(Modifier.fillMaxWidth().panel(opaque = true).padding(horizontal = if (compact) 14.dp else 16.dp, vertical = if (compact) 9.dp else 14.dp)) {
        if (compact) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(r.name, color = Lumen.text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                Spacer(Modifier.width(10.dp))
                Text(r.line, color = Lumen.muted, fontSize = 13.sp, maxLines = 1, softWrap = false)
                Spacer(Modifier.weight(1f))
                Text(r.pct, style = mono(18.sp, FontWeight.Bold), color = Lumen.text, modifier = Modifier.padding(horizontal = 10.dp))
                DetailsToggle(null, details, toggleDetails)
            }
            Box(Modifier.padding(top = 6.dp).fillMaxWidth().height(6.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.08f))) {
                Box(Modifier.fillMaxHeight().fillMaxWidth(progress.coerceIn(0f, 1f)).clip(CircleShape).background(Lumen.spectrum))
            }
            if (details || !r.tipOk) Spacer(Modifier.height(6.dp))
        } else {
            Row(verticalAlignment = Alignment.Bottom) {
                Text(r.name, color = Lumen.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Spacer(Modifier.width(12.dp))
                Text(r.pct, style = mono(22.sp, FontWeight.Bold), color = Lumen.text)
            }
            Box(Modifier.padding(top = 10.dp).fillMaxWidth().height(8.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.08f))) {
                Box(Modifier.fillMaxHeight().fillMaxWidth(progress.coerceIn(0f, 1f)).clip(CircleShape).background(Lumen.spectrum))
            }
            // the row keeps its height while the line is empty: nothing jumps when data arrives
            Row(Modifier.padding(top = 6.dp).fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(r.line, color = Lumen.text, fontSize = 13.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Spacer(Modifier.width(10.dp))
                DetailsToggle(model.t("details"), details, toggleDetails)
            }
        }
        if (details || !r.tipOk) {
            Label(r.tip, size = 13.sp, color = if (r.tipOk) Lumen.muted else Lumen.amber, lines = 2)
        }
        if (details) {
            Box(Modifier.padding(top = 10.dp).fillMaxWidth().height(1.dp).background(Lumen.line))
            FlowRow(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                for (m in r.metrics) {
                    Text(
                        buildAnnotatedString {
                            withStyle(SpanStyle(color = Lumen.muted)) { append(m.label + " ") }
                            withStyle(SpanStyle(color = Lumen.text, fontFamily = Lumen.mono, fontWeight = FontWeight.SemiBold)) { append(m.value) }
                        },
                        fontSize = 12.5.sp, maxLines = 1, softWrap = false,
                    )
                }
            }
            Text(r.diag, style = mono(11.sp), color = Lumen.faint, lineHeight = 16.sp, maxLines = 3, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 8.dp))
        }
    }
}

/** "Details ⌄": folds the numbers in and out (remembered across launches); `label` null: the arrow alone. */
@Composable
private fun DetailsToggle(label: String?, open: Boolean, toggle: () -> Unit) {
    val rot by animateFloatAsState(if (open) 180f else 0f, label = "chevron")
    Row(
        Modifier
            .minimumInteractiveComponentSize()
            .clip(CircleShape)
            .border(1.dp, Lumen.line2, CircleShape)
            .background(Color.White.copy(alpha = 0.04f))
            .clickable(role = Role.Button, onClick = toggle)
            .semantics {
                if (open) collapse { toggle(); true } else expand { toggle(); true }
            }
            .defaultMinSize(minHeight = if (label != null) 36.dp else 30.dp)
            .padding(start = if (label != null) 12.dp else 9.dp, end = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        if (label != null) Text(label, color = Lumen.muted, fontSize = 13.sp, maxLines = 1)
        Icon(Icons.chevronDown, contentDescription = null, tint = Lumen.muted, modifier = Modifier.size(16.dp).rotate(rot))
    }
}

@Composable
private fun StartPane(model: AppModel, r: RecvVM) {
    Box(Modifier.fillMaxSize().background(Lumen.bg).windowInsetsPadding(WindowInsets.safeDrawing)) {
        EntryPane(Icons.viewfinder, Lumen.pink, model.t("recvTitle"), model.t("goSend"),
            onSwitch = { model.dispatch(Ev.navigate("send")) },
        ) {
            Column(Modifier.fillMaxWidth().height(320.dp)) {
                r.error?.let {
                    Text(it, color = Lumen.red, fontSize = 14.sp, modifier = Modifier.padding(bottom = 16.dp))
                }
                r.note?.let { Text(it, color = Lumen.amber, fontSize = 13.sp, modifier = Modifier.padding(top = 14.dp)) }
                Spacer(Modifier.weight(1f))
                if (r.canOpenSettings) {
                    LumenButton(model.t("openSettings"), primary = true, modifier = Modifier.fillMaxWidth().height(48.dp)) { model.dispatch(Ev.openSettings) }
                } else {
                    LumenButton(model.t("openCam"), primary = true, enabled = !r.cameraStarting,
                        modifier = Modifier.fillMaxWidth().height(48.dp), leading = if (r.cameraStarting) {
                            { CircularProgressIndicator(color = Lumen.ink, strokeWidth = 2.dp, modifier = Modifier.size(16.dp)) }
                        } else null,
                    ) { model.dispatch(Ev.openCamera) }
                }
            }
        }
    }
}
