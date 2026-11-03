package com.shelchin.lumen.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.shelchin.lumen.core.AppModel
import com.shelchin.lumen.core.Ev

@Composable
fun Root(model: AppModel) {
    MaterialTheme(colorScheme = darkColorScheme(background = Lumen.bg, surface = Lumen.bg, primary = Lumen.cyan)) {
        Box(Modifier.fillMaxSize().background(Lumen.bg)) {
            val v = model.view ?: return@Box
            Crossfade(targetState = v.screen, animationSpec = tween(180), label = "screen") { screen ->
                val cur = model.view ?: return@Crossfade
                when (screen) {
                    "send" -> SendScreen(model, cur)
                    "receive" -> ReceiveScreen(model, cur)
                    else -> HomeScreen(model)
                }
            }
            // back from a code (playing, paused or waiting on the warning) closes it and returns
            // to the pick screen (open settings close first); from anywhere else it goes home
            val keyboardVisible = WindowInsets.ime.getBottom(LocalDensity.current) > 0
            BackHandler(enabled = v.screen != "home" && !keyboardVisible) {
                val now = model.view
                if (now?.screen == "send" && now.send.phase != "pick" && now.send.settingsOpen && !now.send.flashAsk) model.dispatch(Ev.toggleSettings)
                else if (now?.screen == "send" && now.send.phase != "pick") model.dispatch(Ev.closeSend)
                else model.dispatch(Ev.navigate("home"))
            }
        }
    }
}

/** The home screen: brand, headline and the two actions. */
@Composable
fun HomeScreen(model: AppModel) {
    BoxWithConstraints(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
        val wide = maxWidth > maxHeight
        val compact = maxHeight < 520.dp
        val heroSize = if (compact) 26.sp else 36.sp
        val heroLine = if (compact) 30.sp else 40.sp
        Column(
            Modifier
                .align(Alignment.TopCenter)
                .widthIn(max = 980.dp)
                .fillMaxSize()
                .padding(horizontal = 20.dp),
        ) {
            Row(Modifier.fillMaxWidth().padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                BrandMark()
                Spacer(Modifier.padding(5.dp))
                Label("Lumen Code", size = 16.sp, weight = FontWeight.SemiBold)
                Spacer(Modifier.weight(1f))
                Box(
                    Modifier
                        .clip(RoundedCornerShape(9.dp))
                        .border(1.dp, Lumen.line, RoundedCornerShape(9.dp))
                        .clickable { model.dispatch(Ev.toggleLang) }
                        .padding(horizontal = 10.dp, vertical = 5.dp),
                ) { Label("中 / EN", size = 12.sp, color = Lumen.muted) }
            }
            Column(Modifier.padding(top = if (compact) 16.dp else 32.dp, bottom = 24.dp)) {
                Text(model.t("heroA"), color = Lumen.text, fontSize = heroSize, fontWeight = FontWeight.Bold, lineHeight = heroLine)
                Text(model.t("heroB"), style = TextStyle(brush = Lumen.hero, fontSize = heroSize, fontWeight = FontWeight.Bold, lineHeight = heroLine))
            }
            if (wide) {
                Row(Modifier.weight(1f).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    ChoiceCard(Icons.screen, Lumen.cyan, model.t("sendTitle"), Modifier.weight(1f).fillMaxHeight()) { model.dispatch(Ev.navigate("send")) }
                    ChoiceCard(Icons.viewfinder, Lumen.pink, model.t("recvTitle"), Modifier.weight(1f).fillMaxHeight()) { model.dispatch(Ev.navigate("receive")) }
                }
            } else {
                Column(Modifier.weight(1f).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    ChoiceCard(Icons.screen, Lumen.cyan, model.t("sendTitle"), Modifier.weight(1f)) { model.dispatch(Ev.navigate("send")) }
                    ChoiceCard(Icons.viewfinder, Lumen.pink, model.t("recvTitle"), Modifier.weight(1f)) { model.dispatch(Ev.navigate("receive")) }
                }
            }
            Label(model.t("foot"), size = 12.sp, color = Lumen.faint, modifier = Modifier.padding(top = 20.dp))
            // the version, for reports: app version and the commit of the sources
            Text(
                "${model.t("buildLabel")} ${com.shelchin.lumen.BuildConfig.VERSION_NAME} · ${model.view?.build ?: ""}",
                color = Lumen.faint,
                fontSize = 11.sp,
                fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                modifier = Modifier.padding(top = 6.dp, bottom = 16.dp),
            )
        }
    }
}

@Composable
private fun ChoiceCard(icon: ImageVector, tint: Color, title: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val src = remember { MutableInteractionSource() }
    val pressed by src.collectIsPressedAsState()
    val shape = RoundedCornerShape(20.dp)
    Row(
        modifier
            .fillMaxWidth()
            .scale(if (pressed) 0.98f else 1f)
            .clip(shape)
            .background(Brush.verticalGradient(listOf(Color.White.copy(alpha = 0.05f), Color.White.copy(alpha = 0.02f))))
            .border(1.dp, Lumen.line, shape)
            .clickable(interactionSource = src, indication = null, onClick = onClick)
            .padding(22.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconTile(icon, tint, size = 46.dp)
        Label(title, size = 20.sp, weight = FontWeight.SemiBold)
    }
}
