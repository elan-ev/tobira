use std::{path::PathBuf, fmt};

use crate::prelude::*;
use super::color::ColorConfig;


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

impl fmt::Debug for LogoResolution {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let [w, h] = self.0;
        write!(f, "{}x{}", w, h)
    }
}

impl ThemeConfig {
    pub(crate) fn validate(&self) -> Result<()> {
        self.color.validate()
    }

    /// Returns a string containing CSS that sets lots of variables on the
    /// `:root` element.
    pub(crate) fn to_css(&self) -> String {
        let mut out = String::new();

        // Helper macros
        use std::fmt::Write;
        macro_rules! w {
            ($fmt:literal $($t:tt)*) => {{
                writeln!(out, concat!("      ", $fmt) $($t)*).unwrap();
            }}
        }


        // Header and logo sizes.
        out.push_str(":root {\n");
        w!("  --header-height: {}px;", self.header_height);
        w!("}}");


        // Colors
        let (light, dark) = self.color.css_vars();
        w!("html[data-color-scheme=\"light\"], html:not([data-color-scheme]) {{");
        for (key, value) in light {
            w!("  {}: {};", key, value);
        }
        w!("  color-scheme: light;");
        w!("}}");

        w!("html[data-color-scheme=\"dark\"] {{");
        for (key, value) in dark {
            w!("  {}: {};", key, value);
        }
        w!("  color-scheme: dark;");
        w!("}}");


        out
    }
}
