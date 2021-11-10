use std::fmt;


/// A simple RGB color.
#[derive(Clone, Copy, serde::Deserialize, serde::Serialize)]
#[serde(try_from = "String", into = "String")]
pub(crate) struct Color {
    pub(crate) r: u8,
    pub(crate) g: u8,
    pub(crate) b: u8,
}

impl Color {
    /// Returns either "black" or "white", depending on which of those has a
    /// higher contrast to `self`.
    pub(crate) fn bw_contrast(self) -> &'static str {
        let luminance = (self.r as f32 / 255.0) * 0.299
            + (self.g as f32 / 255.0) * 0.587
            + (self.b as f32 / 255.0) * 0.114;

        // The threshold of 0.6 is fairly arbitrary, but works well in practice.
        // You will find various thresholds in the internet.
        if luminance > 0.6 {
            "black"
        } else {
            "white"
        }
    }
}

impl fmt::Debug for Color {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        Into::<String>::into(*self).fmt(f)
    }
}

impl Into<String> for Color {
    fn into(self) -> String {
        format!("#{:02x}{:02x}{:02x}", self.r, self.g, self.b)
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

        Ok(Self { r, g, b })
    }
}

/// A color represented as HSL triple.
#[derive(Clone, Copy)]
pub(crate) struct Hsl {
    /// Hue in range 0..=360.
    pub(crate) h: f32,

    /// Saturation in range 0..=1.
    pub(crate) s: f32,

    /// Lightness in range 0..=1.
    pub(crate) l: f32,
}

impl Hsl {
    /// Returns a darkened version of `self` where the lightness has been
    /// reduces by `amount * 100%`.
    pub(crate) fn darken(self, amount: f32) -> Self {
        let l = self.l * (1.0 - amount);
        Self { l, ..self }
    }
}

impl From<Color> for Hsl {
    fn from(Color { r, g, b }: Color) -> Self {
        let [r, g, b] = [r, g, b].map(|x| x as f32 / 255.0);

        let max = r.max(g).max(b);
        let min = r.min(g).min(b);
        let range = (max - min) as f32;

        let l = (max + min) as f32 / 2.0;
        let s = if range == 0.0 {
            0.0
        } else {
            range / (1.0 - (2.0 * l - 1.0).abs())
        };

        let h = if r == g && g == b {
            0.0
        } else if r > g && r > b {
            (g - b) as f32 / range + (if g < b { 6.0 } else { 0.0 })
        } else if g > b {
            (b - r) as f32 / range + 2.0
        } else {
            (r - g) as f32 / range + 4.0
        };

        Self {
            h: h / 6.0 * 360.0,
            s,
            l,
        }
    }
}
