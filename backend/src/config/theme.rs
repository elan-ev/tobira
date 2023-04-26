use std::{path::PathBuf, fmt};

use super::Color;


#[derive(Debug, confique::Config)]
pub(crate) struct ThemeConfig {
    /// Height of the header (containing the logo, search bar, and several
    /// icons). Increasing this size only enlarges the logo, the other elements
    /// stay the same size and centered.
    #[config(default = 85)]
    pub(crate) header_height: u32,

    #[config(nested)]
    pub(crate) logo: LogoConfig,

    /// Path to an SVG file that is used as favicon.
    pub(crate) favicon: PathBuf,

    /// Colors used in the UI. Specified in sRGB.
    #[config(nested)]
    pub(crate) color: ColorConfig,
}


/// Logo used in the top left corner of the page. Using SVG logos is recommended.
#[derive(Debug, confique::Config)]
pub(crate) struct LogoConfig {
    /// The normal, usually wide logo that is shown on desktop screens. The
    /// value is a map with a `path` and `resolution` key:
    ///
    ///     large = { path = "logo.svg", resolution = [20, 8] }
    ///
    /// The resolution is only an aspect ratio. It is used to avoid layout
    /// shifts in the frontend by allocating the correct size for the logo
    /// before the browser loaded the file.
    pub(crate) large: LogoDef,

    /// A smaller logo (usually close to square) used for small screens, mostly
    /// on mobile phones. Also a map like the large logo. This is optional, we
    /// highly recommend that you configure a separate logo for small screens.
    /// Otherwise the large logo is used for all screen sizes.
    pub(crate) small: Option<LogoDef>,
}

#[derive(Debug, serde::Deserialize)]
pub(crate) struct LogoDef {
    pub(crate) path: PathBuf,
    pub(crate) resolution: LogoResolution,
}

#[derive(serde::Deserialize)]
pub(crate) struct LogoResolution(pub(crate) [u32; 2]);

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

impl fmt::Debug for LogoResolution {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let [w, h] = self.0;
        write!(f, "{}x{}", w, h)
    }
}

impl ThemeConfig {
    /// Returns a string containing CSS that sets lots of variables on the
    /// `:root` element.
    pub(crate) fn to_css(&self) -> String {
        let mut out = String::from(":root {\n");

        // Helper macros
        use std::fmt::Write;
        macro_rules! add {
            ($key:expr => $value:expr) => {{
                out.push_str("        ");
                writeln!(out, "{}: {};", $key, $value).unwrap();
            }}
        }


        // Header and logo sizes.
        add!("--header-height" => format_args!("{}px", self.header_height));

        // Colors
        for (key, value) in self.color.css_vars() {
            add!(key => value);
        }


        out.push_str("      }");
        out
    }
}
