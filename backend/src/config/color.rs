use std::fmt;

use palette::{Srgb, Lch, FromColor, convert::TryFromColor, Darken};


#[derive(Debug, confique::Config)]
pub(crate) struct ColorConfig {
    /// The primary color used for many different purposes.
    ///
    /// Should have a perceived brightness (L in LCH color space) of 35-55. It
    /// should have a good contrast against a white background. Tobira will
    /// automatically create darker variants of this color.
    #[config(default = "#007A96")]
    pub(crate) primary: Color,

    /// A color used to indicate errors, potentially destructive actions, and
    /// the like. Use a reddish color here as that's expected by users.
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

    /// A color for positive things or some "call to action" buttons, like the
    /// login button. Typically green. Only specify this color if your primary
    /// color is reddish! By default (this color being unspecified), the
    /// primary color is used for all these purposes. This works well, except
    /// for cases where your primary color is red.
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
    pub(super) fn css_vars(&self) -> Vars {
        let mut vars = vec![];


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


        // Primary color
        let primary = Lch::from_color(self.primary.0.into_format::<f32>());
        add_with_bw(&mut vars, "primary0", primary);
        add_with_bw(&mut vars, "primary1", primary.darken_fixed(0.12));
        add_with_bw(&mut vars, "primary2", primary.darken_fixed(0.24));

        // Danger color
        let danger = Lch::from_color(self.danger.0.into_format::<f32>());
        add_with_bw(&mut vars, "danger0", danger);
        add_with_bw(&mut vars, "danger1", danger.darken_fixed(0.12));

        // Happy color
        if let Some(happy) = self.happy {
            let happy = Lch::from_color(happy.0.into_format::<f32>());
            add_with_bw(&mut vars, "happy0", happy);
            add_with_bw(&mut vars, "happy1", happy.darken_fixed(0.12));
            add_with_bw(&mut vars, "happy2", happy.darken_fixed(0.24));
        } else {
            for i in 0..=2 {
                vars.push((format!("--color-happy{i}"), format!("var(--color-primary{i})")));
                vars.push((
                    format!("--color-happy{i}-bw-inverted"),
                    format!("var(--color-primary{i}-bw-inverted)"),
                ));
            }
        }

        // Grey
        let grey = Lch::from_color(self.grey50.0.into_format::<f32>());
        add(&mut vars, "grey0", Lch { l: 97.3, ..grey });
        add(&mut vars, "grey1", Lch { l: 95.6, ..grey });
        add(&mut vars, "grey2", Lch { l: 92.9, ..grey });
        add(&mut vars, "grey3", Lch { l: 87.5, ..grey });
        add(&mut vars, "grey4", Lch { l: 82.0, ..grey });
        add(&mut vars, "grey5", Lch { l: 68.0, ..grey });
        add(&mut vars, "grey6", Lch { l: 43.2, ..grey });
        add(&mut vars, "grey7", Lch { l: 21.2, ..grey });

        vars
    }
}
