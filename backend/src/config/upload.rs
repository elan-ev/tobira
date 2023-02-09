

#[derive(Debug, confique::Config)]
pub(crate) struct UploadConfig {
    /// Whether specifying a series is required when uploading.
    #[config(default = false)]
    pub require_series: bool,
}
