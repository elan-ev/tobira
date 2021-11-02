use std::fmt;


/// A simple RGB color.
#[derive(Clone, Copy, serde::Deserialize, serde::Serialize)]
#[serde(try_from = "String", into = "String")]
pub(crate) struct Color {
    r: u8,
    g: u8,
    b: u8,
}

impl fmt::Debug for Color {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        Into::<String>::into(*self).fmt(f)
    }
}

impl Into<String> for Color {
    fn into(self) -> String {
        format!("#{:02x}{:02x}{:02x}", self.r, self.g, self.b)
    }
}

impl TryFrom<String> for Color {
    type Error = String;

    fn try_from(s: String) -> Result<Self, Self::Error> {
        let s = s.as_bytes();
        if s.len() != 7 {
            return Err(format!("invalid color string length, expected 7, got {}", s.len()));
        }
        if s[0] != b'#' {
            return Err("invalid color string: does not start with '#'".into());
        }

        fn digit(c: u8) -> Result<u8, String> {
            match c {
                b'0'..=b'9' => Ok(c - b'0'),
                b'a'..=b'f' => Ok(c - b'a' + 10),
                b'A'..=b'F' => Ok(c - b'A' + 10),
                _ => Err("invalid hex digit in color string".into())
            }
        }

        let r = 16 * digit(s[1])? + digit(s[2])?;
        let g = 16 * digit(s[3])? + digit(s[4])?;
        let b = 16 * digit(s[5])? + digit(s[6])?;

        Ok(Self { r, g, b })
    }
}
