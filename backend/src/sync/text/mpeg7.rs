use xmlparser::{ElementEnd, Token, Tokenizer};
use anyhow::{anyhow, bail, Result};

use crate::db::types::TimespanText;


/// Helper iterator which just skips tokens we are never interested in.
struct Iter<'a>(Tokenizer<'a>);

impl<'a> Iterator for Iter<'a> {
    type Item = <Tokenizer<'a> as Iterator>::Item;

    fn next(&mut self) -> Option<Self::Item> {
        self.0.find(|token| {
            match token {
                Err(_) => true,
                Ok(Token::ElementStart { .. }) => true,
                Ok(Token::Attribute { .. }) => true,
                Ok(Token::ElementEnd { .. }) => true,
                Ok(Token::Text { .. }) => true,
                Ok(Token::Cdata { .. }) => true,

                // All the stuff we are not interested in
                Ok(Token::Declaration { .. }) => false,
                Ok(Token::ProcessingInstruction { .. }) => false,
                Ok(Token::Comment { .. }) => false,
                Ok(Token::DtdStart { .. }) => false,
                Ok(Token::EmptyDtd { .. }) => false,
                Ok(Token::EntityDeclaration { .. }) => false,
                Ok(Token::DtdEnd { .. }) => false,
            }
        })
    }
}

/// The expected parents of `<VideoSegments>`.
const EXPECTED_STACK: &[&str]
    = &["Mpeg7", "Description", "MultimediaContent", "Video", "TemporalDecomposition"];

/// Somewhat leniently parses an MPEG7 XML document as it occurs in Opencast to
/// specify slide texts.
///
/// This is not a general spec-compliant MPEG7 parser. Said spec is huge and not
/// even public or easily accessible. There is no existing parser for this in
/// the Rust ecosystem and writing one ourselves is absolutely overkill. So
/// while this doesn't feel super clean, this is a best effort parser to
/// quickly extract the data we are interested in. It is somewhat lenient and
/// tries to ignore extra elements and stuff like that.
pub fn parse(src: &str) -> Result<Vec<TimespanText>> {
    let mut it = Iter(Tokenizer::from(src));

    let mut out = Vec::new();
    let mut stack = Vec::new();
    while let Some(token) = it.next() {
        match token? {
            Token::ElementStart { span, .. } => {
                let name = &span.as_str()[1..];
                if name == "VideoSegment" && stack == EXPECTED_STACK {
                    parse_video_segment(&mut it, &mut out)?;
                } else {
                    stack.push(name);
                }
            },
            Token::ElementEnd { end, .. } => {
                if end != ElementEnd::Open {
                    stack.pop();
                }
            }
            _ => {},
        }
    }

    Ok(out)
}

/// Parses the `<VideoSegment>` element, assuming the `ElementStart` is already
/// yielded.
fn parse_video_segment(it: &mut Iter, timespans: &mut Vec<TimespanText>) -> Result<()> {
    let mut media_time = None;
    let mut spatio_td = None;

    parse_children(it, "</VideoSegment>", |name, it| {
        match name {
            "MediaTime" => {
                media_time = Some(parse_media_time(it)?);
            }
            "SpatioTemporalDecomposition" => {
                spatio_td = Some(parse_spatio_td(it)?);
            }
            _ => {},
        };
        Ok(())
    })?;


    let media_time = media_time.ok_or_else(|| {
        anyhow!("missing <MediaTime> element in <VideoSegment>")
    })?;

    // If that element does not exist, there are no texts in this segment.
    let Some(spatio_td) = spatio_td else {
        return Ok(());
    };

    let span_start = media_time.start as i64;
    let span_end = (media_time.start + media_time.duration) as i64;
    timespans.extend(spatio_td.texts.into_iter().map(|t| TimespanText {
        span_start,
        span_end,
        t: t.into(),
    }));
    Ok(())
}

/// Both fields in ms
#[derive(Debug)]
struct MediaTime {
    start: u64,
    duration: u64,
}

/// Parses the `<MediaTime>` element, assuming the `ElementStart` is already
/// yielded.
fn parse_media_time(it: &mut Iter) -> Result<MediaTime> {
    let mut start = None;
    let mut duration = None;

    parse_children(it, "</MediaTime>", |name, it| {
        match name {
            "MediaRelTimePoint" => {
                let text = parse_text_content_element(it)?;
                start = Some(parse_media_rel_time_point(text)?);
            }
            "MediaDuration" => {
                let text = parse_text_content_element(it)?;
                duration = Some(parse_media_duration(text)?);
            }
            _ => {}
        }
        Ok(())
    })?;

    Ok(MediaTime {
        // The start point might be missing, meaning it starts at the beginning
        start: start.unwrap_or(0),
        duration: duration
            .ok_or_else(|| anyhow!("missing <MediaDuration> element in <MediaTime>"))?,
    })
}

/// Parses the string inside `<MediaDuration>` which is close to an ISO 8601
/// duration, but can contain a fractional seconds suffix. An input looks like
/// this: `PT01M22S920N1000F`.
fn parse_media_duration(s: &str) -> Result<u64> {
    /// Parses strings like `680N1000F`, generally `d+Nd+F`. Returns the number of
    /// milliseconds this represents or `None` if it couldn't be parsed.
    fn parse_fractional_seconds(s: &str) -> Option<u64> {
        let (count, unit) = s.split_once('N')?;
        let count: u64 = count.parse().ok()?;
        let divisor: u64 = unit.strip_suffix('F')?.parse().ok()?;
        Some((count * 1000) / divisor)
    }

    let (tail, duration) = iso8601::parsers::parse_duration(s.as_bytes())
        .map_err(|e| anyhow!("failed to parse duration '{s}': {e}"))?;

    match duration {
        iso8601::Duration::YMDHMS { year, month, day, hour, minute, second, millisecond } => {
            anyhow::ensure!(year == 0 && month == 0);
            let tail = &s[s.len() - tail.len()..];
            let fractional = parse_fractional_seconds(tail)
                .ok_or_else(|| anyhow!("failed to parse fractional seconds '{tail}'"))?;
            let out = fractional
                + millisecond as u64
                + second as u64 * 1000
                + minute as u64 * 1000 * 60
                + hour as u64 * 1000 * 60 * 60
                + day as u64 * 1000 * 60 * 60 * 24;
            Ok(out)
        },
        iso8601::Duration::Weeks(weeks) => {
            anyhow::ensure!(tail.is_empty());
            Ok(weeks as u64 * 7 * 24 * 60 * 60 * 1000)
        },
    }
}

/// Parses the string inside of `<MediaRelTimePoint>` which is similar to an ISO
/// 8601 time, but can contain fractional seconds. Input looks like
/// `T00:12:30:440F1000`.
fn parse_media_rel_time_point(s: &str) -> Result<u64> {
    /// Parses strings like `360F1000`. Returns the number of milliseconds this
    /// represents or `None` if it couldn't be parsed.
    fn parse_fractional_seconds(s: &str) -> Option<u64> {
        let (count, unit) = s.split_once('F')?;
        let count: u64 = count.parse().ok()?;
        let divisor: u64 = unit.parse().ok()?;
        Some((count * 1000) / divisor)
    }

    let s = s.strip_prefix("T").ok_or_else(|| anyhow!("rel time point does not start with T"))?;
    let (tail, time) = iso8601::parsers::parse_time(s.as_bytes())
        .map_err(|e| anyhow!("failed to parse media rel time '{s}': {e}"))?;

    let tail = &s[s.len() - tail.len() + 1..];
    let fractional = parse_fractional_seconds(tail)
        .ok_or_else(|| anyhow!("failed to parse fractional seconds '{tail}'"))?;

    let out = fractional
        + time.millisecond as u64
        + time.second as u64 * 1000
        + time.minute as u64 * 1000 * 60
        + time.hour as u64 * 1000 * 60 * 60;
    Ok(out)
}


#[derive(Debug)]
struct SpatioTD<'a> {
    texts: Vec<&'a str>,
}

/// Parses the `<SpatioTemporalDecomposition>` element, assuming the
/// `ElementStart` is already yielded.
fn parse_spatio_td<'a>(it: &mut Iter<'a>) -> Result<SpatioTD<'a>> {
    let mut texts = Vec::new();

    parse_children(it, "</SpatioTemporalDecomposition>", |name, it| {
        if name == "VideoText" {
            texts.extend(parse_video_text(it)?);
        }
        Ok(())
    })?;

    Ok(SpatioTD { texts })
}

/// Parses the `<VideoText>` element, assuming the `ElementStart` is already
/// yielded. Ignores the `<MediaDuration>` and just looks at the `<Text>`
/// child.
fn parse_video_text<'a>(it: &mut Iter<'a>) -> Result<Option<&'a str>> {
    let mut text = None;

    parse_children(it, "</VideoText>", |name, it| {
        if name == "Text" {
            text = Some(parse_text_content_element(it)?);
        }
        Ok(())
    })?;

    Ok(text)
}

/// Parses a simple element that has only text as its content. Attributes are
/// skipped (if any) and end element is eaten.
fn parse_text_content_element<'a>(it: &mut Iter<'a>) -> Result<&'a str> {
    match skip_attrs(it)? {
        ElementEnd::Open => {},
        ElementEnd::Close(_, _) => bail!("unexpected element close tag"),
        ElementEnd::Empty => return Ok(""),
    }

    let Token::Text { text } = it.next().ok_or_else(unexpected_eof)?? else {
        bail!("expected text token");
    };
    let Token::ElementEnd { .. } = it.next().ok_or_else(unexpected_eof)?? else {
        bail!("expected element end token");
    };

    Ok(text.as_str())
}

/// Helper to parse element with children elements in any order. Attributes are
/// just ignored and the end tag is consumed.
fn parse_children<'a>(
    it: &mut Iter<'a>,
    end_tag: &str,
    mut on_child: impl FnMut(&str, &mut Iter<'a>) -> Result<()>,
) -> Result<()> {
    match skip_attrs(it)? {
        ElementEnd::Open => {},
        ElementEnd::Close(_, _) => bail!("unexpected element close tag"),
        ElementEnd::Empty => return Ok(()),
    }

    let mut depth = 0;
    loop {
        match it.next().ok_or_else(unexpected_eof)?? {
            Token::ElementStart { span, .. } => {
                let name = &span[1..];
                on_child(name, it)?;
            },
            Token::ElementEnd { end, span } => {
                if span == end_tag && depth == 0 {
                    break;
                }
                if end == ElementEnd::Open {
                    depth += 1;
                } else {
                    depth -= 1;
                }
            },
            _ => {}
        }
    }

    Ok(())
}


/// Can be called after an `ElementStart` token, skipping all its attributes and
/// returns once an `ElementEnd` token is found, which is returned.
fn skip_attrs<'a>(it: &mut Iter<'a>) -> Result<ElementEnd<'a>> {
    loop {
        match it.next().ok_or_else(unexpected_eof)?? {
            Token::Attribute { .. } => {}
            Token::ElementEnd { end, .. } => return Ok(end),
            other => bail!("unexpected {other:?}"),
        }
    }
}

fn unexpected_eof() -> anyhow::Error {
    anyhow::anyhow!("Unexpected EOF")
}
