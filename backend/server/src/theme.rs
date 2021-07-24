use std::path::PathBuf;


#[derive(Debug, confique::Config)]
pub(crate) struct ThemeConfig {
    #[config(default = 70)]
    pub(crate) header_height: u32,

    #[config(default = 10)]
    pub(crate) header_padding: u32,

    /// Path to CSS file that includes all used font files and sets the variable
    /// `--main-font` in the `:root` selector. For example:
    ///
    /// ```
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
    /// Path to the "normal", wide logo that is shown on desktop screens.
    pub(crate) large: PathBuf,

    /// Path to the small, close to square logo used for small screens, mostly
    /// on mobile phones.
    pub(crate) small: PathBuf,
}

#[derive(Debug, confique::Config)]
pub(crate) struct ColorConfig {
    // TODO: make sure color format is valid

    #[config(default = "#357C58")]
    pub(crate) navigation: String,

    /// Accent color with large contrast to navigation color.
    #[config(default = "#007A96")]
    pub(crate) accent: String,

    /// Grey tone with 50% lightness/brightness. Several brighter and
    /// darker variants of this are created automatically. This is
    /// configurable in case you want to have a slightly colored grey,
    /// e.g. slightly warm.
    #[config(default = "#808080")]
    pub(crate) grey50: String,
}
