use std::{path::PathBuf, fmt};

use super::{Color, Hsl};


#[derive(Debug, confique::Config)]
pub(crate) struct ThemeConfig {
    /// Height of the header (containing the logo, search bar, and several
    /// icons). Increasing this size only enlarges the logo, the other elements
    /// stay the same size and centered.
    #[config(default = 100)]
    pub(crate) header_height: u32,

    #[config(nested)]
    pub(crate) logo: LogoConfig,

    /// Path to an SVG file that is used as favicon.
    pub(crate) favicon: PathBuf,

    #[config(nested)]
    pub(crate) color: ColorConfig,
}


/// Logo used in the top left corner of the page. Using SVG logos is recommended.
#[derive(Debug, confique::Config)]
pub(crate) struct LogoConfig {
    /// The normal, usually wide logo that is shown on desktop screens.
    #[config(nested)]
    pub(crate) large: SingleLogoConfig,

    /// A smaller logo (usually close to square) used for small screens, mostly
    /// on mobile phones.
    #[config(nested)]
    pub(crate) small: SingleLogoConfig,
}

#[derive(Debug, confique::Config)]
pub(crate) struct SingleLogoConfig {
    /// Path to the image file.
    pub(crate) path: PathBuf,

    /// Resolution of the image. This is used to avoid layout shifts and to
    /// calculate the correct logo margins. The exact numbers don't matter,
    /// only the ratio between them does.
    pub(crate) resolution: LogoResolution,
}

#[derive(serde::Deserialize)]
pub(crate) struct LogoResolution(pub(crate) [u32; 2]);

#[derive(Debug, confique::Config)]
pub(crate) struct ColorConfig {
    #[config(default = "#347856")]
    pub(crate) navigation: Color,

    /// Accent color with large contrast to navigation color.
    #[config(default = "#007A96")]
    pub(crate) accent: Color,

    /// Grey tone with 50% lightness/brightness. Several brighter and
    /// darker variants of this are created automatically. This is
    /// configurable in case you want to have a slightly colored grey,
    /// e.g. slightly warm.
    #[config(default = "#808080")]
    pub(crate) grey50: Color,

    /// A usually red color used to indicate errors, potentially destructive
    /// actions, and the like.
    #[config(default = "#b64235")]
    pub(crate) danger: Color,

    /// A color for positive things or some "call to action" buttons, like the
    /// login button. Typically green.
    #[config(default = "#27ae60")]
    pub(crate) happy: Color,
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
        macro_rules! hsl {
            ($base:literal) => {
                format_args!(
                    "hsl(var(--{base}-hue), var(--{base}-sat), var(--{base}-lightness))",
                    base = $base,
                )
            };
            ($base:literal | lighten $amount:expr) => {
                format_args!(
                    "hsl(var(--{base}-hue), var(--{base}-sat), \
                        calc(var(--{base}-lightness) * {mult} + {add}%))",
                    base = $base,
                    mult = (1.0 - $amount),
                    add = $amount * 100.0,
                )
            };
            ($base:literal | darken $amount:expr) => {
                format_args!(
                    "hsl(var(--{base}-hue), var(--{base}-sat), \
                        calc(var(--{base}-lightness) * {mult}))",
                    base = $base,
                    mult = (1.0 - $amount),
                )
            };
            ($base:literal, $lightness:expr) => {
                format_args!(
                    "hsl(var(--{base}-hue), var(--{base}-sat), {lightness}%)",
                    base = $base,
                    lightness = $lightness,
                )
            }
        }


        // Header and logo sizes.
        add!("--header-height" => format_args!("{}px", self.header_height));


        // Colors
        let nav = Hsl::from(self.color.navigation);
        add!("--nav-hue" => format_args!("{:.2}", nav.h));
        add!("--nav-sat" => format_args!("{:.2}%", nav.s * 100.0));
        add!("--nav-lightness" => format_args!("{:.2}%", nav.l * 100.0));
        add!("--nav-color" => hsl!("nav"));
        add!("--nav-color-dark" => hsl!("nav" | darken 0.2));
        add!("--nav-color-darker" => hsl!("nav" | darken 0.4));
        add!("--nav-color-bw-contrast" => self.color.navigation.bw_contrast());

        let accent = Hsl::from(self.color.accent);
        add!("--accent-hue" => format_args!("{:.2}", accent.h));
        add!("--accent-sat" => format_args!("{:.2}%", accent.s * 100.0));
        add!("--accent-lightness" => format_args!("{:.2}%", accent.l * 100.0));
        add!("--accent-color" => hsl!("accent"));
        add!("--accent-color-darker" => hsl!("accent" | darken 0.4));
        add!("--accent-color-bw-contrast" => self.color.accent.bw_contrast());

        let danger = Hsl::from(self.color.danger);
        add!("--danger-hue" => format_args!("{:.2}", danger.h));
        add!("--danger-sat" => format_args!("{:.2}%", danger.s * 100.0));
        add!("--danger-lightness" => format_args!("{:.2}%", danger.l * 100.0));
        add!("--danger-color" => hsl!("danger"));
        add!("--danger-color-darker" => hsl!("danger" | darken 0.4));
        add!("--danger-color-bw-contrast" => self.color.danger.bw_contrast());

        let happy = Hsl::from(self.color.happy);
        add!("--happy-hue" => format_args!("{:.2}", happy.h));
        add!("--happy-sat" => format_args!("{:.2}%", happy.s * 100.0));
        add!("--happy-lightness" => format_args!("{:.2}%", happy.l * 100.0));
        add!("--happy-color" => hsl!("happy"));
        add!("--happy-color-lighter" => hsl!("happy" | lighten 0.15));
        add!("--happy-color-darker" => hsl!("happy" | darken 0.1));
        add!("--happy-color-dark" => hsl!("happy" | darken 0.3));
        add!("--happy-color-bw-contrast" => self.color.happy.bw_contrast());

        let grey = Hsl::from(self.color.grey50);
        add!("--grey-hue" => format_args!("{:.2}", grey.h));
        add!("--grey-sat" => format_args!("{:.2}%", grey.s * 100.0));
        add!("--grey97" => hsl!("grey", 97.0));
        add!("--grey95" => hsl!("grey", 95.0));
        add!("--grey92" => hsl!("grey", 92.0));
        add!("--grey86" => hsl!("grey", 86.0));
        add!("--grey80" => hsl!("grey", 80.0));
        add!("--grey65" => hsl!("grey", 65.0));
        add!("--grey40" => hsl!("grey", 40.0));
        add!("--grey20" => hsl!("grey", 20.0));


        // Finish
        out.push_str("      }");
        out
    }
}
