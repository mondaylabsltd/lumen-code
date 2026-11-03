//! The home screen: brand, headline and the two actions.

use crate::app::Root;
use crate::theme::*;
use gpui::{div, prelude::*, px, AnyElement, Context, FontWeight, HighlightStyle, Hsla, Rgba, StyledText, Window};
use lumen_app::app::{Event, Screen};

/// Text in the hero gradient (cyan → pink → amber), one colour per character.
pub fn gradient_text(text: &str) -> StyledText {
    let stops: [(f32, Rgba); 3] = [(0.0, gpui::rgb(CYAN)), (0.55, gpui::rgb(PINK)), (1.0, gpui::rgb(AMBER))];
    let n = text.chars().count().max(2) as f32 - 1.0;
    let mut highlights = Vec::new();
    for (i, (at, ch)) in text.char_indices().enumerate() {
        let t = i as f32 / n;
        let (a, b) = if t <= stops[1].0 { (stops[0], stops[1]) } else { (stops[1], stops[2]) };
        let k = ((t - a.0) / (b.0 - a.0)).clamp(0.0, 1.0);
        let mix = Rgba { r: a.1.r + (b.1.r - a.1.r) * k, g: a.1.g + (b.1.g - a.1.g) * k, b: a.1.b + (b.1.b - a.1.b) * k, a: 1.0 };
        let color: Hsla = mix.into();
        highlights.push((at..at + ch.len_utf8(), HighlightStyle { color: Some(color), ..Default::default() }));
    }
    StyledText::new(text.to_string()).with_highlights(highlights)
}

fn choice(root: &Root, id: &'static str, icon_name: &str, tint: u32, title: &str, screen: Screen) -> AnyElement {
    let rt = root.rt.clone();
    div()
        .id(id)
        .flex_1()
        .min_w_0()
        .h_full()
        .flex()
        .items_center()
        .justify_center()
        .gap(px(12.))
        .px(px(18.))
        .rounded(px(16.))
        .bg(c(0x0e131b))
        .border_1()
        .border_color(line())
        .hover(move |s| s.bg(c(0x151c27)).border_color(c(tint).opacity(0.45)))
        .cursor_pointer()
        .on_click(move |_, _, _| rt.dispatch(Event::Navigate { screen }))
        .child(icon_tile(icon_name, tint, 38.))
        .child(div().text_size(px(17.)).font_weight(FontWeight::SEMIBOLD).child(title.to_string()))
        .into_any_element()
}

pub fn render(root: &mut Root, window: &mut Window, _cx: &mut Context<Root>) -> impl IntoElement {
    let rt = root.rt.clone();
    let height = f32::from(window.viewport_size().height);
    let compact = height < 560.0;
    div().id("home").size_full().overflow_y_scroll().child(
        div()
            .w_full()
            .max_w(px(960.))
            .h(px(height.max(440.)))
            .mx_auto()
            .px(px(28.))
            .pt(px(title_inset(window) + 20.))
            .pb(px(20.))
            .flex()
            .flex_col()
            .child(
                div()
                    .h(px(40.))
                    .flex_none()
                    .flex()
                    .items_center()
                    .justify_between()
                    .child(
                        div().flex().items_center().gap(px(10.))
                            .child(brand_mark(5.))
                            .child(div().text_size(px(16.)).font_weight(FontWeight::SEMIBOLD).child("Lumen Code")),
                    )
                    .child(
                        div()
                            .id("lang")
                            .h(px(36.))
                            .px(px(12.))
                            .flex()
                            .items_center()
                            .rounded(px(10.))
                            .text_size(px(12.))
                            .text_color(c(MUTED))
                            .cursor_pointer()
                            .hover(|s| s.bg(white(0.04)).text_color(c(TEXT)))
                            .child("中 / EN")
                            .on_click(move |_, _, _| rt.dispatch(Event::ToggleLang)),
                    ),
            )
            .child(
                div()
                    .flex_1()
                    .min_h_0()
                    .flex()
                    .items_center()
                    .justify_center()
                    .child(
                        div()
                            .w_full()
                            .max_w(px(520.))
                            .flex()
                            .flex_col()
                            .items_center()
                            .child(
                                div()
                                    .w_full()
                                    .text_center()
                                    .text_size(px(if compact { 30. } else { 38. }))
                                    .line_height(px(if compact { 40. } else { 48. }))
                                    .font_weight(FontWeight::BOLD)
                                    .child(div().child(root.t("heroA")))
                                    .child(div().child(gradient_text(root.t("heroB")))),
                            )
                            .child(
                                div()
                                    .w_full()
                                    .max_w(px(420.))
                                    .h(px(80.))
                                    .flex_none()
                                    .mt(px(if compact { 28. } else { 36. }))
                                    .flex()
                                    .gap(px(16.))
                                    .child(choice(root, "choose-send", "screen", CYAN, root.t("sendTitle"), Screen::Send))
                                    .child(choice(root, "choose-recv", "scan", PINK, root.t("recvTitle"), Screen::Receive)),
                            ),
                    ),
            )
            // Keep the source version available for reports, without another block of copy.
            .child(
                div()
                    .flex_none()
                    .pt(px(24.))
                    .text_center()
                    .text_size(px(11.))
                    .font_family(MONO)
                    .text_color(c(FAINT))
                    .child(format!("{} {} · {}", root.t("buildLabel"), env!("CARGO_PKG_VERSION"), root.view.build)),
            ),
    )
}
