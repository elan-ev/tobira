use std::convert::TryInto;


/// An opaque, globally-unique identifier for all "nodes" that the GraphQL API
/// might return.
///
/// While the ID should be treated as completely opaque by the frontend, of
/// course there is some system in it that the backend can use. This is to make
/// sure we can easily convert the ID to a database primary key.
///
/// Each key is encoded as 12 byte ASCII string.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Id {
    /// The kind of node. Each different "thing" in our API has a different
    /// static prefix. For example, realms have the prefix `b"re"`. All IDs
    /// referring to a realm starts with `re`.
    kind: [u8; 2],

    /// This uniquely refers to one object from the class of objects defined by
    /// `kind`. This is typically exactly the primary bigint database key. This
    /// data is encoded with base85 (well, our own flavor of it) to compactly
    /// represent it in a JSON string.
    key: Key,
}

/// The type of key we are using.
pub type Key = u64;


impl Id {
    /// Creates a new ID. The `kind` must only consist of alphanumeric ASCII
    /// characters.
    pub fn new(kind: &'static [u8; 2], key: Key) -> Self {
        assert!(kind.iter().all(|b| b.is_ascii_alphanumeric()));

        Self {
            kind: *kind,
            key,
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
        let mut out = [0; 12];
        out[0] = self.kind[0];
        out[1] = self.kind[1];

        out[2..7].copy_from_slice(&encode_base85((self.key >> 32) as u32));
        out[7..12].copy_from_slice(&encode_base85(self.key as u32));

        let s = std::str::from_utf8(&out)
            .expect("bug: base85 did produce non ASCII character")
            .to_owned();
        juniper::Value::scalar(s)
    }

    fn from_input_value(value: &juniper::InputValue) -> Option<Self> {
        let s = value.as_string_value()?;
        if s.len() != 12 {
            return None;
        }

        let s = s.as_bytes();
        let kind = [s[0], s[1]];
        let hi = decode_base85(s[2..7].try_into().unwrap())?;
        let lo = decode_base85(s[7..12].try_into().unwrap())?;
        let key = ((hi as u64) << 32) | lo as u64;

        Some(Self { kind, key })
    }

    fn from_str<'a>(value: juniper::ScalarToken<'a>) -> juniper::ParseScalarResult<'a, S> {
        <String as juniper::ParseScalarValue<S>>::from_str(value)
    }
}


// ============================================================================
// ===== Our base 85 encoding
// ============================================================================

/// Base 85 has no single formal definition and there are a few different
/// implementations out there. They differ in how they do padding, how they
/// chunk and in the alphabet. We use the alphabet suggested in RFC 1924 [1] as
/// it can be represented in JSON without escaping. Note however that we don't
/// use the same chunking as the mentioned RFC.
///
/// [1]: https://tools.ietf.org/html/rfc1924
const BASE85_DIGITS: &[u8; 85] = b"\
    0123456789\
    ABCDEFGHIJKLMNOPQRSTUVWXYZ\
    abcdefghijklmnopqrstuvwxyz\
    !#$%&()*+-;<=>?@^_`{|}~\
";

/// Encodes 4 bytes (one chunk) as base85, resulting in 5 ASCII bytes.
fn encode_base85(v: u32) -> [u8; 5] {
    // "Ascii 85" uses big endian encoding, but there is no official spec anyway
    // and we do not need to stick to any rules. Our IDs do not interact with
    // anything and are not supposed to be understood. We just need to be
    // internally consistent. So we use little endian byte order. Let's be real,
    // Tobira will only ever run on little endian machines. We still enforce a
    // specific byte order here to be consistent across CPUs.
    let mut v = v.to_le();

    // Repeatedly divide by 85.
    let mut out = [0u8; 5];
    for i in (0..out.len()).rev() {
        out[i] = BASE85_DIGITS[(v % 85) as usize];
        v = v / 85;
    }

    out
}

/// Base 85 decodes one chunk of 5 ASCII bytes into the represented 4 bytes of
/// data. Returns `None` if the the input contains invalid digits or encodes a
/// number larger than `u32::MAX`.
///
/// This should return `Result` with useful error information once juniper can
/// actually use that error information.
fn decode_base85(s: [u8; 5]) -> Option<u32> {
    /// The reverse lookup table to `BASE85_DIGITS`. If you index by an ASCII value, you
    /// either get the corresponding digit value OR `0xFF`, signalling that the
    /// character is not a valid base85 character.
    const DECODE_TABLE: [u8; 256] = create_decode_table();

    const fn create_decode_table() -> [u8; 256] {
        let mut out = [0xFF; 256];

        // If you wonder why we are using `while` instead of a more idiomatic loop:
        // const fns are still somewhat limited and do not allow `for`.
        let mut i = 0;
        while i < BASE85_DIGITS.len() {
            out[BASE85_DIGITS[i] as usize] = i as u8;
            i += 1;
        }

        out
    }

    fn lookup(ascii: u8) -> Option<u64> {
        let raw = DECODE_TABLE[ascii as usize];
        if raw == 0xFF {
            return None;
        }

        Some(raw as u64)
    }

    let v = lookup(s[4])?
        + lookup(s[3])? * 85u64.pow(1)
        + lookup(s[2])? * 85u64.pow(2)
        + lookup(s[1])? * 85u64.pow(3)
        + lookup(s[0])? * 85u64.pow(4);

    let v: u32 = v.try_into().ok()?;

    // See `encode_base85` regarding endianess.
    Some(u32::from_le(v))
}


#[cfg(test)]
mod tests {
    use super::{decode_base85, encode_base85, BASE85_DIGITS};

    #[test]
    fn simple() {
        #[track_caller]
        fn check(v: u32, s: [u8; 5]) {
            assert_eq!(encode_base85(v), s);
            assert_eq!(decode_base85(s), Some(v));
        }

        check(0, *b"00000");
        check(83, *b"0000}");
        check(84, *b"0000~");
        check(85, *b"00010");
        check(86, *b"00011");
        check(u32::MAX - 1, *b"|NsB~");
        check(u32::MAX, *b"|NsC0");
    }

    #[test]
    fn invalid_decode() {
        // Invalid characters
        assert_eq!(decode_base85(*br"00\00"), None);
        assert_eq!(decode_base85(*b"aa\0aa"), None);

        // Encoded value > u32::MAX
        assert_eq!(decode_base85(*b"|NsC1"), None);
        assert_eq!(decode_base85(*b"~~~~~"), None);
    }

    #[test]
    fn always_ascii() {
        // We don't want to test all 4 billion possible u32 values, but by
        // checking all two bytes patterns (and testing them in different shift
        // positions), we should have good coverage. We just want to make sure
        // we don't emit strange or non-ASCII characters.
        for n in 0..=u16::MAX {
            for &shift in &[0, 8, 16] {
                let encoded = encode_base85((n as u32) << shift);
                assert!(encoded.iter().all(|b| BASE85_DIGITS.contains(b)));
                assert!(encoded.is_ascii());
            }
        }
    }
}
