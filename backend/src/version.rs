mod build_info {
    include!(concat!(env!("OUT_DIR"), "/built.rs"));
}

/// Returns the main version identifier as used for releases, e.g. `v3.8`.
pub(crate) fn identifier() -> String {
    let digits = build_info::PKG_VERSION.strip_suffix(".0")
        .expect("Cargo package version does not end in '.0'");

    format!("v{digits}")
}

/// Returns an RFC 2822 formatted date of the build time in UTC.
pub(crate) fn build_time_utc() -> &'static str {
    build_info::BUILT_TIME_UTC
}

/// Returns the commit hash this was build from.
pub(crate) fn git_commit_hash() -> &'static str {
    build_info::GIT_COMMIT_HASH.expect("missing git version info")
}

/// Returns whether the git working directory was dirty when this was built.
pub(crate) fn git_was_dirty() -> bool {
    // We count `None` as `false` as this occurs in GH action runners.
    build_info::GIT_DIRTY == Some(true)
}

/// Returns a string containing all version-related information.
pub(crate) fn full() -> String {
    format!(
        "{} ({}{}), built {}",
        identifier(),
        git_commit_hash(),
        if git_was_dirty() { ", dirty" } else { "" },
        build_time_utc(),
    )
}
