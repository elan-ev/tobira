use juniper::{GraphQLScalar, InputValue, ScalarValue};
use paste::paste;
use serde::{Deserialize, Serialize};
use static_assertions::const_assert;
use std::fmt;

use crate::model::Key;


/// An opaque, globally-unique identifier for all "nodes" that the GraphQL API
/// might return.
///
/// While the ID should be treated as completely opaque by the frontend, of
/// course there is some system in it that the backend can use. This is to make
/// sure we can easily convert the ID to a database primary key.
///
/// Each key is encoded as 12 byte ASCII string.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, GraphQLScalar)]
#[graphql(
    name = "ID",
    description = "An opaque, globally-unique identifier",
    parse_token(String),
)]
pub(crate) struct Id {
    /// The kind of node. Each different "thing" in our API has a different
    /// static prefix. For example, realms have the prefix `b"re"`. All IDs
    /// referring to a realm starts with `re`.
    kind: [u8; 2],

    /// This uniquely refers to one object from the class of objects defined by
    /// `kind`. This is typically exactly the primary bigint database key. This
    /// data is encoded with base85 (well, our own flavor of it) to compactly
    /// represent it in a JSON string.
    ///
    /// Note that this is a private field. To get to it, you need to prove
    /// that you know what kind of ID it is using [`Self::key_for`].
    key: Key,
}


// Macro to safely define a list of "kinds", each with a two alphanumeric ASCII
// character prefix. This will create a function and a const associated with
// `Id`.
macro_rules! define_kinds {
    ($($name:ident = $val:literal ,)+) => {
        // Emit an associated const and function.
        paste!(
            impl Id {
                $(
                    pub(crate) const [<$name:upper _KIND>]: [u8; 2] = *$val;

                    pub(crate) fn $name(key: Key) -> Self {
                        Self {
                            kind: Self:: [<$name:upper _KIND>],
                            key,
                        }
                    }
                )+
            }
        );

        // Make sure all kinds are ASCII alphanumeric. Unfortunately, the error
        // resulting from this is very ugly. But that's still better than no
        // error at all.
        $(
            const_assert!($val[0].is_ascii_alphanumeric());
            const_assert!($val[1].is_ascii_alphanumeric());
        )+

        // Make sure that all kind prefixes are different. Creating a dummy enum
        // is the easiest way I could think of. The error message is not
        // beautiful, but at least it fails to compile.
        #[allow(non_camel_case_types)]
        #[repr(u16)]
        enum _KindChecker {
            $( $name = u16::from_ne_bytes(*$val), )+
        }
    };
}

// Define all existing kinds of nodes.
//
// If you get a strange error:
// - "discriminant value `25970` already exists": you added a duplicate prefix.
// - "evaluation of constant value failed": you added a prefix that's not
//   alphanumeric ASCII.
define_kinds![
    realm = b"re",
    block = b"bl",
    series = b"sr",
    event = b"ev",
    playlist = b"pl",
    search_realm = b"rs",
    search_event = b"es",
    search_series = b"ss",
    search_playlist = b"ps",
];


impl Id {
    /// See `invalid`.
    const INVALID_KIND: [u8; 2] = *b"!!";

    /// Returns an ID that refers to no object at all. This is used to signal an
    /// ID that cannot be parsed. We treat malformed IDs in this way to make IDs
    /// truly opaque: that way, we just return "no node with that ID" instead of
    /// distinguishing between "no node found" and "invalid ID syntax".
    fn invalid() -> Self {
        Self {
            kind: Self::INVALID_KIND,
            key: Key(0),
        }
    }

    /// Returns the key of this id if the kind is equal to `expected_kind`. If
    /// the kinds don't match, `None` is returned. This is not just a simple
    /// getter as that would make it very easy to accidentally not check the
    /// kind of an id.
    pub(crate) fn key_for(&self, expected_kind: [u8; 2]) -> Option<Key> {
        if self.kind == expected_kind {
            Some(self.key)
        } else {
            None
        }
    }

    pub(crate) fn kind(&self) -> [u8; 2] {
        self.kind
    }

    fn to_output<S: ScalarValue>(&self) -> juniper::Value<S> {
        juniper::Value::scalar(self.to_string())
    }

    fn from_input<S: ScalarValue>(input: &InputValue<S>) -> Result<Self, String> {
        let s = input.as_string_value().ok_or("expected string")?;
        Ok(s.parse().unwrap_or(Self::invalid()))
    }
}

impl std::str::FromStr for Id {
    type Err = &'static str;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        if s.len() != 13 {
            return Err("invalid length");
        }

        let bytes = s.as_bytes();
        let kind = [bytes[0], bytes[1]];
        let key = Key::from_base64(&s[2..]).ok_or("invalid base64")?;

        Ok(Self { kind, key })
    }
}

impl fmt::Display for Id {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        let mut out = [b' '; 13];
        out[0] = self.kind[0];
        out[1] = self.kind[1];
        self.key.to_base64((&mut out[2..]).try_into().unwrap());

        std::str::from_utf8(&out)
            .expect("base64 encoding resulted in non-ASCII")
            .fmt(f)
    }
}

#[cfg(test)]
mod tests {
    use std::str::FromStr;
    use super::{Id, Key};

    #[test]
    fn simple() {
        #[track_caller]
        fn check(kind: [u8; 2], key: u64, s: &str) {
            let left = Id { kind, key: Key(key) };
            assert_eq!(left.to_string(), s);
            assert_eq!(Id::from_str(s), Ok(left));
        }

        check(Id::REALM_KIND, 0, "reAAAAAAAAAAA");
        check(Id::REALM_KIND, 1, "reAAAAAAAAAAB");
        check(Id::REALM_KIND, 62, "reAAAAAAAAAA-");
        check(Id::BLOCK_KIND, 63, "blAAAAAAAAAA_");
        check(Id::BLOCK_KIND, 64, "blAAAAAAAAABA");
        check(Id::REALM_KIND, 65, "reAAAAAAAAABB");

        check(Id::SERIES_KIND, u64::MAX - 1, "srP_________-");
        check(Id::SERIES_KIND, u64::MAX, "srP__________");
    }

    #[test]
    fn invalid_decode() {
        // Wrong length
        assert_eq!(Id::from_str(""), Err("invalid length"));
        assert_eq!(Id::from_str("re"), Err("invalid length"));
        assert_eq!(Id::from_str("reAAAAAAAAAAAA"), Err("invalid length"));

        // Invalid characters
        assert_eq!(Id::from_str("re0000000000*"), Err("invalid base64"));
        assert_eq!(Id::from_str("re0000000000?"), Err("invalid base64"));
        assert_eq!(Id::from_str("re0000000000/"), Err("invalid base64"));

        // Encoded value > u64::MAX
        assert_eq!(Id::from_str("srQAAAAAAAAAA"), Err("invalid base64"));
        assert_eq!(Id::from_str("sr___________"), Err("invalid base64"));
    }

    #[test]
    fn always_ascii() {
        // We can't test all possible u64 values, but by checking all two bytes
        // patterns (and testing them in different shift positions), we should
        // have good coverage. We just want to make sure we don't emit strange
        // or non-ASCII characters.
        for n in 0..=u16::MAX {
            for &shift in &[0, 8, 16, 24, 32, 40, 48] {
                let id = Id { kind: Id::REALM_KIND, key: Key((n as u64) << shift) };
                let s = id.to_string();
                assert_eq!(s[..2].as_bytes(), Id::REALM_KIND);
                assert!(s[2..].bytes().all(|d| crate::util::BASE64_DIGITS.contains(&d)));
            }
        }
    }
}
