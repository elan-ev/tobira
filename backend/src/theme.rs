use std::path::PathBuf;


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

    /// A usually red color used to indicate errors, potentially destructive
    /// actions, and the like.
    #[config(default = "#b64235")]
    pub(crate) danger: String,
}
