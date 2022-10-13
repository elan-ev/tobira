use std::collections::HashMap;

use once_cell::sync::Lazy;

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

    /// Additional metadata that is shown below a video. Example:
    ///
    ///     [general.metadata]
    ///     dcterms.spatial = { en = "Location", de = "Ort" }
    ///     "http://my.domain/xml/namespace".courseLink = { en = "Course", de = "Kurs"}
    ///
    /// As you can see, this is a mapping of a metadata location (the XML
    /// namespace and the name) to a translated label. For the XML namespace
    /// URL, there is one shortcut: the "http://purl.org/dc/terms/" is
    /// abbreviated as just "dcterms".
    ///
    /// Instead of the manually translated label, you can use some builtin
    /// labels like this:
    ///
    ///     dcterms.license = "builtin:license"
    ///     dcterms.source = "builtin:source"
    ///
    /// As soon as you add your own metadata fields, this default is
    /// overwritten. If you want to keep showing the license and source data,
    /// you have to add those two lines to your configuration.
    //
    // TODO: this shouldn't be `Option`, but `config(default = ...)` does not
    // support complex types like this yet.
    metadata: Option<MetadataLabels>,

    /// A list of URL paths that are reserved for other usages. Users won't be
    /// able to create top-level realms with those path segments. Tobira also
    /// has some additional built-in reserved paths (e.g. `/favicon.ico`).
    ///
    /// Example: ["/Shibboleth.sso", "/something-else"]
    // TODO: this shouldn't be `Option`, but `config(default = ...)` does not
    // support complex types like this yet.
    reserved_paths: Option<Vec<String>>,
}

const INTERNAL_RESERVED_PATHS: &[&str] = &["favicon.ico", "robots.txt", ".well-known"];

impl GeneralConfig {
    pub(crate) fn footer_links(&self) -> &[FooterLink] {
        self.footer_links.as_deref().unwrap_or(&[FooterLink::About, FooterLink::GraphiQL])
    }

    pub(crate) fn metadata(&self) -> &MetadataLabels {
        static DEFAULT: Lazy<MetadataLabels> = Lazy::new(|| HashMap::from([
            ("dcterms".to_string(), HashMap::from([
                ("license".to_string(), MetadataLabel::License),
                ("source".to_string(), MetadataLabel::Source),
            ]))
        ]));

        self.metadata.as_ref().unwrap_or(&DEFAULT)
    }

    /// Returns an iterator over all reserved top-level paths without leading slash.
    pub(crate) fn reserved_paths(&self) -> impl Iterator<Item = &str> {
        self.reserved_paths.as_deref()
            .unwrap_or(&[])
            .iter()
            .map(|s| s.strip_prefix("/").unwrap_or(s))
            .chain(INTERNAL_RESERVED_PATHS.iter().copied())
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

pub(crate) type MetadataLabels = HashMap<String, HashMap<String, MetadataLabel>>;

#[derive(Debug, serde::Deserialize, serde::Serialize)]
#[serde(untagged)]
pub(crate) enum MetadataLabel {
    #[serde(with = "serde_metadata_license")]
    License,
    #[serde(with = "serde_metadata_source")]
    Source,
    Custom(TranslatedString),
}

make_fixed_string_deserializer!(serde_metadata_license, "builtin:license");
make_fixed_string_deserializer!(serde_metadata_source, "builtin:source");
