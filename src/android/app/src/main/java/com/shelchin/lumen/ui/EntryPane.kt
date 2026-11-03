package com.shelchin.lumen.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Shared layout for choosing what to send or how to receive, before a transfer starts. */
@Composable
fun EntryPane(
    icon: ImageVector,
    tint: Color,
    title: String,
    switchLabel: String,
    onSwitch: () -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    BoxWithConstraints(Modifier.fillMaxSize().imePadding()) {
        val viewportHeight = maxHeight
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState())
                .heightIn(min = viewportHeight).padding(horizontal = 20.dp, vertical = 64.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            val shape = RoundedCornerShape(24.dp)
            Column(
                Modifier.widthIn(max = 420.dp).fillMaxWidth()
                    .height(520.dp).background(Lumen.bg2, shape).border(1.dp, Lumen.line, shape).padding(24.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    IconTile(icon, tint, size = 44.dp)
                    Label(title, size = 22.sp, weight = FontWeight.SemiBold)
                }
                Spacer(Modifier.height(24.dp))
                Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState())) { content() }
                }
                Box(Modifier.padding(top = 24.dp).fillMaxWidth().height(1.dp).background(Lumen.line))
                Row(
                    Modifier.fillMaxWidth().padding(top = 8.dp).heightIn(min = 44.dp)
                        .clickable(role = Role.Button, onClick = onSwitch),
                    horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Label(switchLabel, size = 14.sp, color = Lumen.muted)
                    Icon(Icons.arrowRight, null, tint = Lumen.muted, modifier = Modifier.size(16.dp))
                }
            }
        }
    }
}
