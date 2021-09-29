use postgres_types::{FromSql, ToSql};


#[derive(Debug, FromSql, ToSql)]
#[postgres(name = "event_track")]
pub struct EventTrack {
    pub uri: String,
    pub flavor: String,
    pub mimetype: Option<String>,
    // TODO: that should be `[i32; 2]` but `ToSql` is not implemented for it
    pub resolution: Option<Vec<i32>>,
}
