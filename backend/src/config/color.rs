use std::fmt;

use palette::{Srgb, Lch, FromColor, convert::TryFromColor, Darken, Lighten};

use crate::prelude::*;


#[derive(Debug, confique::Config)]
pub(crate) struct ColorConfig {
    /// The primary color used for most colored UI elements. Should have a
    /// perceived brightness (L in LCH color space) of 35-55.
    #[config(default = "#01758f")]
    pub(crate) primary: Color,

    /// A color used to indicate errors and potentially destructive actions.
    /// Should be red.
    #[config(default = "#b64235")]
    pub(crate) danger: Color,

    /// Grey tone. This is configurable in case you want to have a slightly
    /// colored grey, e.g. slightly warm.
    ///
    /// Only hue and saturation (or more precisely, hue and chroma in the LCH
    /// color space) are used from this. The brightness of the configured color
    /// is ignored. Still try using a color with roughly 50% perceived
    /// brightness to reduce rounding errors.
    #[config(default = "#777777")]
    pub(crate) grey50: Color,

    /// A color for positive things and "call to action" elements. Only specify
    /// this color if your primary color is reddish!
    pub(crate) happy: Option<Color>,
}


/// A simple sRGB color.
#[derive(Clone, Copy, serde::Deserialize, serde::Serialize)]
#[serde(try_from = "String", into = "String")]
pub(crate) struct Color(Srgb<u8>);

impl fmt::Debug for Color {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        Into::<String>::into(*self).fmt(f)
    }
}

impl Into<String> for Color {
    fn into(self) -> String {
        format!("#{:02x}{:02x}{:02x}", self.0.red, self.0.green, self.0.blue)
    }
}

impl TryFrom<String> for Color {
    type Error = String;

    fn try_from(s: String) -> Result<Self, Self::Error> {
        let s = s.as_bytes();
        if s.len() != 7 {
            return Err(format!("invalid color string length, expected 7, got {}", s.len()));
        }
        if s[0] != b'#' {
            return Err("invalid color string: does not start with '#'".into());
        }

        fn digit(c: u8) -> Result<u8, String> {
            match c {
                b'0'..=b'9' => Ok(c - b'0'),
                b'a'..=b'f' => Ok(c - b'a' + 10),
                b'A'..=b'F' => Ok(c - b'A' + 10),
                _ => Err("invalid hex digit in color string".into())
            }
        }

        let r = 16 * digit(s[1])? + digit(s[2])?;
        let g = 16 * digit(s[3])? + digit(s[4])?;
        let b = 16 * digit(s[5])? + digit(s[6])?;

        Ok(Self(Srgb::new(r, g, b)))
    }
}

type Vars = Vec<(String, String)>;

impl ColorConfig {
    pub(crate) fn validate(&self) -> Result<()> {
        // Make sure the primary color is in a good range.
        //
        // Regarding the minimum of 35: We have two variations, with one being
        // having 24 less brightness. So with 35 starting brightness, that only
        // leaves 11, which is quite dim. The color should still be noticable
        // there.
        //
        // Regarding the maximum: We want to place this color on our grey1
        // background, which has 95.6% brightness. The WCAG contrast between
        // two colors only depend on the `l` channel, i.e. the perceived
        // lightness (well, there are differences and rounding errors, but it's
        // not relevant here). For a contrast ratio of 4.5:1 to the grey1
        // background, a brightness of at most 46.5 is required.
        let primary = Lch::from_color(self.primary.0.into_format::<f32>());
        if primary.l < 35.0 || primary.l > 46.5 {
            warn!(
                "`theme.color.primary` is too {}! It should have a perceived \
                    lightness of 35 - 46.5, but has {:.1}. See the documentation.",
                if primary.l < 35.0 { "dark" } else { "bright" },
                primary.l,
            );
        }

        // Check danger color with the same reasoning as for `primary`. Except
        // we only create one darker version of it.
        let danger = Lch::from_color(self.danger.0.into_format::<f32>());
        if danger.l < 23.0 || danger.l > 46.5 {
            warn!(
                "`theme.color.danger` is too {}! It should have a perceived \
                    lightness of 23 - 46.5, but has {:.1}. See the documentation.",
                if danger.l < 35.0 { "dark" } else { "bright" },
                danger.l,
            );
        }

        // Check happy color if it's set. Just the minimum is checked as it's
        // never used as text color, but otherwise the logic as for `primary`.
        if let Some(happy) = self.happy {
            let happy = Lch::from_color(happy.0.into_format::<f32>());
            if happy.l < 35.0 {
                warn!(
                    "`theme.color.happy` is too dark! It should have a perceived \
                        lightness at least 35, but has {:.1}. See the documentation.",
                    happy.l,
                );
            }
        }


        Ok(())
    }

    /// Returns the CSS variables for light and dark themes, respectively.
    pub(super) fn css_vars(&self) -> (Vars, Vars) {
        let mut light = vec![];
        let mut dark = vec![];


        fn add(vars: &mut Vars, name: &str, color: Lch) {
            // We have to calculate the closest sRGB value to the given LCH
            // value. This is not trivial and there is not actually a "best"
            // solution. See [this article][1] for more information.
            // Unfortunately, `palette` does not offer any good way to do that.
            // Its `FromColor` trait just clamps each RGB channel individually
            // which can cause bad distortions. One of the most used and also
            // easiest methods is to keep the lightness and keep the hue, just
            // reduce the chroma (saturation). Ideally this should be done by
            // some math to immediately arrive at the best answer, BUT since we
            // only need to do this for very few colors AND because this whole
            // code can be thrown away once LCH browser support is better, we
            // will just use an dumb iterative approach. One could improve this
            // with binary search, but again, not worth it!
            //
            //
            // TODO: Once `lch` is more widely supported in browsers, we should
            // not break this down to sRGB, but rather emit the `lch()`
            // definition directly.
            //
            // [1]: https://bottosson.github.io/posts/gamutclipping/
            let mut muted = color;
            let srgb;
            loop {
                if let Ok(valid_srgb) = Srgb::try_from_color(muted) {
                    srgb = valid_srgb.into_format::<u8>();
                    break;
                } else {
                    muted.chroma -= 0.2;
                }
            }

            let hex = format!("#{:02x}{:02x}{:02x}", srgb.red, srgb.green, srgb.blue);
            vars.push((format!("--color-{name}"), hex));
        }

        fn add_with_bw(vars: &mut Vars, name: &str, color: Lch) {
            add(vars, name, color);

            // Here we calculate the color with the maximum contrast to `color`
            // (which is either black or white). As there are multiple
            // definitions for "contrast", there are multiple way to do this.
            // We could say we want to maximize the WCAG contrast, but:
            // - This is a bit more involved.
            // - The WCAG contrast defintion is likely changing soon to address
            //   new research in perceived contrast.
            // - In fact, the current WCAG contrast formula is not based
            //   on "perceived lightness" of a color. See [1].
            // - The L channel of our color exactly represents the perceived
            //   lightness. So we can simply check that. This is super close to
            //   the WCAG contrast anyway.
            //
            // Of course, we need to consider the actually used color `srgb`
            // instead of the ideal `color`. However, as the above algorithm
            // only changes chrome, the L channel stays the same and we can
            // just use `color.l`.
            //
            // [1]: https://stackoverflow.com/q/76103459/2408867
            let bw = if color.l > 50.0 { "black" } else { "white" };
            vars.push((format!("--color-{name}-bw-inverted"), bw.into()));
        }


        fn dark_color(light: Lch) -> Lch {
            // Inverting the lightness is not enough as the background color in
            // dark mode is not pure black. To achieve the same contrast, we
            // make it so that the dark color has the same lightness difference
            // from the dark background, as the light color has from white.
            // `100 - light.l` is the difference in light mode and `7` is the
            // lightness of the dark background.
            Lch { l: 7.0 + 100.0 - light.l, ..light }
        }

        // Primary color
        let primary = Lch::from_color(self.primary.0.into_format::<f32>());
        add_with_bw(&mut light, "primary0", primary);
        add_with_bw(&mut light, "primary1", primary.darken_fixed(0.12));
        add_with_bw(&mut light, "primary2", primary.darken_fixed(0.24));
        let primary_dark = dark_color(primary);
        add_with_bw(&mut dark, "primary0", primary_dark);
        add_with_bw(&mut dark, "primary1", primary_dark.lighten_fixed(0.12));
        add_with_bw(&mut dark, "primary2", primary_dark.lighten_fixed(0.24));

        // Danger color
        let danger = Lch::from_color(self.danger.0.into_format::<f32>());
        add_with_bw(&mut light, "danger0", danger);
        add_with_bw(&mut light, "danger1", danger.darken_fixed(0.12));
        let danger_dark = dark_color(danger);
        add_with_bw(&mut dark, "danger0", danger_dark);
        add_with_bw(&mut dark, "danger1", danger_dark.lighten_fixed(0.12));

        // Happy color
        if let Some(happy) = self.happy {
            let happy = Lch::from_color(happy.0.into_format::<f32>());
            add_with_bw(&mut light, "happy0", happy);
            add_with_bw(&mut light, "happy1", happy.darken_fixed(0.12));
            add_with_bw(&mut light, "happy2", happy.darken_fixed(0.24));
            let happy_dark = dark_color(happy);
            add_with_bw(&mut dark, "happy0", happy_dark);
            add_with_bw(&mut dark, "happy1", happy_dark.lighten_fixed(0.12));
            add_with_bw(&mut dark, "happy2", happy_dark.lighten_fixed(0.24));
        } else {
            for i in 0..=2 {
                for vars in [&mut light, &mut dark] {
                    vars.push((
                        format!("--color-happy{i}"),
                        format!("var(--color-primary{i})"),
                    ));
                    vars.push((
                        format!("--color-happy{i}-bw-inverted"),
                        format!("var(--color-primary{i}-bw-inverted)"),
                    ));
                }
            }
        }


        // Grey
        let base_grey = Lch::from_color(self.grey50.0.into_format::<f32>());
        add(&mut light, "grey0", Lch { l: 97.3, ..base_grey });
        add(&mut light, "grey1", Lch { l: 95.6, ..base_grey });
        add(&mut light, "grey2", Lch { l: 92.9, ..base_grey });
        add(&mut light, "grey3", Lch { l: 87.5, ..base_grey });
        add(&mut light, "grey4", Lch { l: 82.0, ..base_grey });
        add(&mut light, "grey5", Lch { l: 68.0, ..base_grey });
        add(&mut light, "grey6", Lch { l: 43.2, ..base_grey });
        add(&mut light, "grey7", Lch { l: 21.2, ..base_grey });

        add(&mut dark, "grey0", Lch { l: 9.5, ..base_grey });
        add(&mut dark, "grey1", Lch { l: 11.2, ..base_grey });
        add(&mut dark, "grey2", Lch { l: 13.9, ..base_grey });
        add(&mut dark, "grey3", Lch { l: 17.5, ..base_grey });
        add(&mut dark, "grey4", Lch { l: 24.0, ..base_grey });
        add(&mut dark, "grey5", Lch { l: 36.0, ..base_grey });
        add(&mut dark, "grey6", Lch { l: 60.0, ..base_grey });
        add(&mut dark, "grey7", Lch { l: 80.0, ..base_grey });


        // Foreground & background
        add(&mut light, "background", Lch::new(100.0, 0.0, 0.0));
        add(&mut light, "foreground", Lch::new(0.0, 0.0, 0.0));
        add(&mut dark, "background", Lch { l: 7.0, ..base_grey });
        add(&mut dark, "foreground", Lch::new(100.0, 0.0, 0.0));

        (light, dark)
    }
}
