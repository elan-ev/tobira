use super::TranslatedString;


#[derive(Debug, confique::Config)]
pub(crate) struct GeneralConfig {
    /// The main title of the video portal. Used in the HTML `<title>`, as main
    /// heading on the home page, and potentially more.
    // TODO: fix automatically generated `site_title =` template output.
    pub(crate) site_title: TranslatedString,

    /// Links that are shown in the footer. By default, two links are shown:
    ///
    /// ```
    /// footer_links = ["about", "graphiql"]
    /// ```
    ///
    /// By overwriting this value, you can remove the default links and add
    /// custom ones. Note that these two default links are special and can be
    /// specified with only the shown string. To add custom ones, you need to
    /// define a label and a link. Example:
    ///
    /// ```
    /// footer_links = [
    ///     { label = { en = "Example" }, link = "https://example.com" },
    ///     "about",
    /// ]
    /// ```
    // TODO: this shouldn't be `Option`, but `config(default = ...)` does not
    // support complex types like this yet.
    footer_links: Option<Vec<FooterLink>>,
}

impl GeneralConfig {
    pub(crate) fn footer_links(&self) -> &[FooterLink] {
        self.footer_links.as_deref().unwrap_or(&[FooterLink::About, FooterLink::GraphiQL])
    }
}

#[derive(Debug, serde::Deserialize, serde::Serialize)]
#[serde(untagged)]
pub(crate) enum FooterLink {
    #[serde(with = "serde_about_footer")]
    About,
    #[serde(with = "serde_graphiql_footer")]
    GraphiQL,
    Custom {
        label: TranslatedString,
        link: String,
    }
}

// We want to deserialize and serialize the unit variants of `FooterLink` as
// simple strings. Unfortunately, this means we have to write some manual code
// here.
macro_rules! make_fixed_string_deserializer {
    ($name:ident, $s:expr) => {
        mod $name {
            pub(super) fn deserialize<'de, D>(deserializer: D) -> Result<(), D::Error>
                where D: serde::Deserializer<'de>,
            {
                use serde::de::{Deserialize, Error};

                match <&str>::deserialize(deserializer)? {
                    $s => Ok(()),
                    _ => Err(D::Error::custom(concat!("incorrect value, expected '", $s, "'"))),
                }
            }

            pub(super) fn serialize<S: serde::Serializer>(serializer: S) -> Result<S::Ok, S::Error> {
                serializer.serialize_str($s)
            }
        }
    };
}

make_fixed_string_deserializer!(serde_about_footer, "about");
make_fixed_string_deserializer!(serde_graphiql_footer, "graphiql");
