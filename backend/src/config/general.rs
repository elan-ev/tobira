use super::TranslatedString;


#[derive(Debug, confique::Config)]
pub(crate) struct GeneralConfig {
    /// The main title of the video portal. Used in the HTML `<title>`, as main
    /// heading on the home page, and potentially more.
    // TODO: fix automatically generated `site_title =` template output.
    pub(crate) site_title: TranslatedString,
}
