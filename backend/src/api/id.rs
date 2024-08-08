use paste::paste;
use serde::{Deserialize, Serialize};
use static_assertions::const_assert;
use std::fmt;

use crate::{db::types::Key, util::{base64_decode, BASE64_DIGITS}};


/// An opaque, globally-unique identifier for all "nodes" that the GraphQL API
/// might return.
///
/// While the ID should be treated as completely opaque by the frontend, of
/// course there is some system in it that the backend can use. This is to make
/// sure we can easily convert the ID to a database primary key.
///
/// Each key is encoded as 12 byte ASCII string.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
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
}

impl Key {
    pub(crate) fn from_base64(s: &str) -> Option<Self> {
        if s.len() != 11 {
            return None;
        }

        decode_base64(s.as_bytes())
    }

    pub(crate) fn to_base64<'a>(&self, out: &'a mut [u8; 11]) -> &'a str {
        // Base64 encoding. After this loop, `n` is always 0, because `u64::MAX`
        // divided by 64 eleven times is 0.
        let mut n = self.0;
        for i in (0..out.len()).rev() {
            out[i] = BASE64_DIGITS[(n % 64) as usize];
            n /= 64;
        }
        debug_assert!(n == 0);

        std::str::from_utf8(out)
            .expect("bug: base64 did produce non-ASCII character")
    }
}

impl std::str::FromStr for Id {
    // TODO: we might want to have more information about the error later, but
    // the GraphQL API doesn't currently use it anyway.
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        if s.len() != 13 {
            return Err(());
        }

        let bytes = s.as_bytes();
        let kind = [bytes[0], bytes[1]];
        let key = Key::from_base64(&s[2..]).ok_or(())?;

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

#[juniper::graphql_scalar(
    name = "ID",
    description = "An opaque, globally-unique identifier",
)]
impl<S> GraphQLScalar for Id
where
    S: juniper::ScalarValue
{
    fn resolve(&self) -> juniper::Value {
        juniper::Value::scalar(self.to_string())
    }

    fn from_input_value(value: &juniper::InputValue) -> Option<Self> {
        let s = value.as_string_value()?;
        Some(s.parse().unwrap_or(Self::invalid()))
    }

    fn from_str<'a>(value: juniper::ScalarToken<'a>) -> juniper::ParseScalarResult<'a, S> {
        <String as juniper::ParseScalarValue<S>>::from_str(value)
    }
}

fn decode_base64(src: &[u8]) -> Option<Key> {
    let src: [u8; 11] = src.try_into().ok()?;

    // Make sure the string doesn't decode to a number > `u64::MAX`. Luckily,
    // checking that is easy. `u64::MAX` encodes to `P__________`, so the next
    // higher number would carry through and make the highest digit a `Q`. So we
    // just make sure the first digit is between 'A' and 'P'.
    if src[0] > b'P' || src[0] < b'A' {
        return None;
    }

    src.iter()
        .rev()
        .enumerate()
        .map(|(i, &d)| base64_decode(d).map(|n| n as u64 * 64u64.pow(i as u32)))
        .sum::<Option<u64>>()
        .map(Key)
}


#[cfg(test)]
mod tests {
    use std::str::FromStr;
    use super::{Id, Key, BASE64_DIGITS};

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
        assert_eq!(Id::from_str(""), Err(()));
        assert_eq!(Id::from_str("re"), Err(()));
        assert_eq!(Id::from_str("reAAAAAAAAAAAA"), Err(()));

        // Invalid characters
        assert_eq!(Id::from_str("re0000000000*"), Err(()));
        assert_eq!(Id::from_str("re0000000000?"), Err(()));
        assert_eq!(Id::from_str("re0000000000/"), Err(()));

        // Encoded value > u64::MAX
        assert_eq!(Id::from_str("srQAAAAAAAAAA"), Err(()));
        assert_eq!(Id::from_str("sr___________"), Err(()));
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
                assert!(s[2..].bytes().all(|d| BASE64_DIGITS.contains(&d)));
            }
        }
    }
}
