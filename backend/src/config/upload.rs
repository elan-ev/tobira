

#[derive(Debug, confique::Config)]
pub(crate) struct UploadConfig {
    /// Whether specifying a series is required when uploading.
    #[config(default = false)]
    pub require_series: bool,

    /// Specify workflow to start after ingesting. If unset, Tobira does not
    /// send any workflow ID, meaning Opencast will choose its default.
    pub workflow: Option<String>,
}
