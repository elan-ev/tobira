use std::path::PathBuf;

use super::{Color, Hsl};


#[derive(Debug, confique::Config)]
pub(crate) struct ThemeConfig {
    #[config(default = 50)]
    pub(crate) header_height: u32,

    /// Path to CSS file that includes all used font files and sets the variable
    /// `--main-font` in the `:root` selector. For example:
    ///
    /// ```text
    /// :root {
    ///     --main-font: 'Open Sans';
    /// }
    ///
    /// @font-face { font-family: 'Open Sans'; src: ...; }
    /// ```
    ///
    /// If not set, the default font will be used.
    pub(crate) fonts: Option<String>,

    #[config(nested)]
    pub(crate) logo: LogoConfig,

    #[config(nested)]
    pub(crate) color: ColorConfig
}


/// Logo used in the top left corner of the page. Using SVG logos is recommended.
#[derive(Debug, confique::Config)]
pub(crate) struct LogoConfig {
    /// The margin around the logo in terms of logo height. A value of 0.5 means
    /// that there will be a margin around the logo of half the height of the
    /// logo.
    #[config(default = 0.4)]
    pub(crate) margin: f32,

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
    pub(crate) resolution: [u32; 2],
}

#[derive(Debug, confique::Config)]
pub(crate) struct ColorConfig {
    // TODO: make sure color format is valid

    #[config(default = "#357C58")]
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
            ($base:expr, $lightness:expr) => {
                format_args!(
                    "hsl(var(--{base}-hue), var(--{base}-sat), {lightness:.2}%)",
                    base = $base,
                    lightness = $lightness * 100.0,
                )
            }
        }


        // Header and logo sizes.
        add!("--logo-margin" => self.logo.margin);
        add!("--inner-header-height" => format_args!("{}px", self.header_height));
        add!("--outer-header-height" =>
            "calc(var(--inner-header-height) * (1 + 2 * var(--logo-margin)))");


        // Colors
        let nav = Hsl::from(self.color.navigation);
        add!("--nav-hue" => format_args!("{:.2}", nav.h));
        add!("--nav-sat" => format_args!("{:.2}%", nav.s * 100.0));
        add!("--nav-color" => hsl!("nav", nav.l));
        add!("--nav-color-darker" => hsl!("nav", nav.darken(0.4).l));
        add!("--nav-color-bw-contrast" => self.color.navigation.bw_contrast());

        let accent = Hsl::from(self.color.accent);
        add!("--accent-hue" => format_args!("{:.2}", accent.h));
        add!("--accent-sat" => format_args!("{:.2}%", accent.s * 100.0));
        add!("--accent-color" => hsl!("accent", accent.l));
        add!("--accent-color-darker" => hsl!("accent", accent.darken(0.4).l));
        add!("--accent-color-bw-contrast" => self.color.accent.bw_contrast());

        let danger = Hsl::from(self.color.danger);
        add!("--danger-hue" => format_args!("{:.2}", danger.h));
        add!("--danger-sat" => format_args!("{:.2}%", danger.s * 100.0));
        add!("--danger-color" => hsl!("danger", danger.l));
        add!("--danger-color-darker" => hsl!("danger", danger.darken(0.4).l));
        add!("--danger-color-bw-contrast" => self.color.danger.bw_contrast());

        let happy = Hsl::from(self.color.happy);
        add!("--happy-hue" => format_args!("{:.2}", happy.h));
        add!("--happy-sat" => format_args!("{:.2}%", happy.s * 100.0));
        add!("--happy-color" => hsl!("happy", happy.l));
        add!("--happy-color-lighter" => hsl!("happy", happy.darken(-0.15).l));
        add!("--happy-color-darker" => hsl!("happy", happy.darken(0.1).l));
        add!("--happy-color-dark" => hsl!("happy", happy.darken(0.3).l));
        add!("--happy-color-bw-contrast" => self.color.happy.bw_contrast());

        let grey = Hsl::from(self.color.grey50);
        add!("--grey-hue" => format_args!("{:.2}", grey.h));
        add!("--grey-sat" => format_args!("{:.2}%", grey.s * 100.0));
        add!("--grey97" => hsl!("grey", 0.97));
        add!("--grey92" => hsl!("grey", 0.92));
        add!("--grey80" => hsl!("grey", 0.80));
        add!("--grey65" => hsl!("grey", 0.65));
        add!("--grey40" => hsl!("grey", 0.40));


        // Finish
        out.push_str("      }");
        out
    }
}
