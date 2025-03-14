use std::{collections::HashMap, fmt, path::PathBuf};
use serde::{Deserialize, Serialize};

use crate::model::LangKey;
use super::color::ColorConfig;


#[derive(Debug, confique::Config)]
pub(crate) struct ThemeConfig {
    /// Height of the header. Increasing this size only enlarges the logo, the
    /// other elements stay the same size and centered.
    #[config(default = 85)]
    pub(crate) header_height: u32,

    /// Path to an SVG file that is used as favicon.
    pub(crate) favicon: PathBuf,

    /// Logo used in the top left corner of the page. Using SVG logos is recommended.
    /// You can configure specific logos for small and large screens, dark and light mode,
    /// and any number of languages. Example:
    ///
    /// ```
    /// logos = [
    ///     { path = "logo-wide-light.svg", mode = "light", size = "wide", resolution = [425, 182] },
    ///     { path = "logo-wide-dark.svg", mode = "dark", size = "wide", resolution = [425, 182] },
    ///     { path = "logo-small.svg", size = "narrow", resolution = [212, 182] },
    /// ]
    /// ```
    ///
    /// See the documentation on theming/logos for more info and additional examples!
    #[config(validate = validate_logos)]
    pub(crate) logos: Vec<LogoDef>,

    /// Colors used in the UI. Specified in sRGB.
    #[config(nested)]
    pub(crate) color: ColorConfig,

    #[config(nested)]
    pub(crate) font: FontConfig,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub(crate) struct LogoDef {
    pub(crate) size: Option<LogoSize>,
    pub(crate) mode: Option<LogoMode>,
    pub(crate) lang: Option<LangKey>,
    pub(crate) path: PathBuf,
    pub(crate) resolution: LogoResolution,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Hash)]
#[serde(rename_all = "lowercase")]
pub(crate) enum LogoSize {
    Wide,
    Narrow,
}

impl fmt::Display for LogoSize {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(f)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Hash)]
#[serde(rename_all = "lowercase")]
pub(crate) enum LogoMode {
    Light,
    Dark,
}

impl fmt::Display for LogoMode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(f)
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct LogoResolution(pub(crate) [u32; 2]);

impl fmt::Debug for LogoResolution {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let [w, h] = self.0;
        write!(f, "{}x{}", w, h)
    }
}

#[derive(Debug, confique::Config)]
pub(crate) struct FontConfig {
    /// The main font family to use in Tobira. Needs to be a valid CSS value for
    /// `font-family`.
    #[config(default = "'Open Sans'")]
    pub(crate) main_family: String,

    /// Path to a CSS file with extra `@font-face` declarations. If you want to
    /// refer to files included via `font_files` (see below), be sure to to
    /// include the full path, e.g. `/~assets/fonts/vollkorn-400.woff2`. That's
    /// required as the font files are served with a hashed filename for
    /// caching and Tobira needs to fix up the path in your CSS.
    pub(crate) extra_css: Option<PathBuf>,

    /// Additional font files to serve under `/~assets/fonts/`. Prefer using the
    /// WOFF 2.0 format: it has excellent browser support and great compression.
    #[config(default = [])]
    pub(crate) files: Vec<PathBuf>,
}

impl ThemeConfig {
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


        let (light, dark, global) = self.color.css_vars();

        out.push_str(":root {\n");
        w!("  --header-height: {}px;", self.header_height);
        for (key, value) in global {
            w!("  {}: {};", key, value);
        }
        w!("}}");


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

fn validate_logos(logos: &Vec<LogoDef>) -> Result<(), String> {
    #[derive()]
    enum LangLogo {
        Universal(usize),
        LangSpecific(HashMap<LangKey, usize>),
    }

    let all_modes = [LogoMode::Light, LogoMode::Dark];
    let all_sizes = [LogoSize::Wide, LogoSize::Narrow];

    let mut cases = HashMap::new();
    for (i, logo) in logos.iter().enumerate() {
        let modes = logo.mode.map(|m| vec![m]).unwrap_or(all_modes.to_vec());
        let sizes = logo.size.map(|s| vec![s]).unwrap_or(all_sizes.to_vec());

        for &mode in &modes {
            for &size in &sizes {
                let key = (mode, size);

                if let Some(entry) = cases.get_mut(&key) {
                    let conflicting = match (entry, &logo.lang) {
                        (LangLogo::LangSpecific(m), Some(lang)) => m.insert(lang.clone(), i),
                        (LangLogo::LangSpecific(m), None) => m.values().next().copied(),
                        (LangLogo::Universal(c), _) => Some(*c),
                    };

                    if let Some(conflicting) = conflicting {
                        return Err(format!(
                            "ambiguous logo definition: \
                                entry {i} (path: '{curr_path}') conflicts with \
                                entry {prev_index} (path: '{prev_path}'). \
                                Both define a {mode} {size} logo, which is only allowed \
                                if both have different 'lang' keys! Consider adding 'mode' \
                                or 'size' fields to make entries more specific.",
                            i = i + 1,
                            prev_index = conflicting + 1,
                            curr_path = logo.path.display(),
                            prev_path = logos[conflicting].path.display(),
                        ));
                    }
                } else {
                    cases.insert(key, match &logo.lang {
                        Some(lang) => LangLogo::LangSpecific(HashMap::from([(lang.clone(), i)])),
                        None => LangLogo::Universal(i),
                    });
                }
            }
        }
    }

    // Check that all cases are defined
    for mode in all_modes {
        for size in all_sizes {
            match cases.get(&(mode, size)) {
                None => return Err(format!(
                    "incomplete logo configuration: no {mode} {size} logo defined",
                )),
                Some(LangLogo::LangSpecific(m)) if !m.contains_key(&LangKey::Default) => {
                    return Err(format!(
                        "incomplete logo configuration: {mode} {size} logo is \
                            missing `lang = '*'` entry",
                    ));
                }
                _ => {}
            }
        }
    }

    Ok(())
}
