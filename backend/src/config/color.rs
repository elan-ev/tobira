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
    /// Returns either "black" or "white", depending on which has the higher
    /// contrast to `self`. Contrast calculation based on [WCAG2.1 Technique G18][1].
    ///
    /// [1]: https://www.w3.org/WAI/WCAG21/Techniques/general/G18.html
    pub(crate) fn bw_contrast(self) -> &'static str {
        fn linear_value(color_component: u8) -> f32 {
            let s_rgb = (color_component as f32) / 255.0;
            if s_rgb <= 0.04045 {
                s_rgb / 12.92
            } else {
                ((s_rgb + 0.055) / 1.055).powf(2.4)
            }
        }

        let relative_luminance = 0.2126 * linear_value(self.r)
            + 0.7152 * linear_value(self.g)
            + 0.0722 * linear_value(self.b);
        let contrast_with_white = 1.05 / (relative_luminance + 0.05);
        let contrast_with_black = (relative_luminance + 0.05) / 0.05;

        if contrast_with_white < contrast_with_black {
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


#[cfg(test)]
mod tests {
    use super::Color;
    #[test]
    fn test_bw_contrast() {
        let navigation_green = Color { r: 52, g: 120, b: 86 };
        let accent_blue = Color { r: 0, g: 122, b: 150 };
        let neutral_grey = Color { r: 128, g: 128, b: 128};
        let danger_red = Color { r: 182, g: 66, b: 53 };
        let happy_green = Color { r: 39, g: 174, b: 96 };

        assert_eq!(navigation_green.bw_contrast(), "white");
        assert_eq!(accent_blue.bw_contrast(), "white");
        assert_eq!(neutral_grey.bw_contrast(), "black");
        assert_eq!(danger_red.bw_contrast(), "white");
        assert_eq!(happy_green.bw_contrast(), "black");
    }
}
