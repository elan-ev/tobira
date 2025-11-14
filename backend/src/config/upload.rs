

#[derive(Debug, confique::Config)]
pub(crate) struct UploadConfig {
    /// Whether specifying a series is required when uploading.
    #[config(default = false)]
    pub require_series: bool,

    /// Specify workflow to start after ingesting. If unset, Tobira does not
    /// send any workflow ID, meaning Opencast will choose its default.
    pub workflow: Option<String>,

    /// Subtype of thumbnail image. Has to match the subtype used in the related
    /// Opencast workflows and should be identical to what is set for the editor.
    /// See https://github.com/opencast/opencast/blob/a68c337f11499a0a939a5a96bffa3898c1cd032c/etc/org.opencastproject.editor.EditorServiceImpl.cfg#L58
    ///
    /// Please note that `player+preview` should still be used for the final publication
    /// as there are multiple operations in Opencast that rely on that hardcoded subtype,
    /// meaning it cannot be overwritten by any configuration in these places.
    #[config(default = "player+preview")]
    pub thumbnail_subtype: String,

    /// When uploading a thumbnail, this property is set to trigger
    /// the operation that prepares the thumbnail for publication
    /// in the default `partial-publish` workflow.
    /// This needs to match the property in Opencast and should also be identical
    /// to what is set for the editor when you don't use custom workflows for publication.
    /// See https://github.com/opencast/opencast/blob/a68c337f11499a0a939a5a96bffa3898c1cd032c/etc/org.opencastproject.editor.EditorServiceImpl.cfg#L62
    #[config(default = "thumbnail_edited")]
    pub thumbnail_workflow_property: String,
}
