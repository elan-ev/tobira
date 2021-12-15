use std::fmt;

/// A lazy `fmt` formatter, specified by a callable. Usually created via
/// `lazy_format!`.
///
/// This is particularly useful in situation, where you want a method to return
/// a formatted value, but don't want to return an allocated `String`. For
/// example, if the returned value is formatted into yet another value anyway,
/// allocating a string is useless. Instead of returning `String`, you then
/// return `impl fmt::Display + '_`.
pub(crate) struct LazyFormat<F: Fn(&mut fmt::Formatter) -> fmt::Result>(pub F);

impl<F> fmt::Display for LazyFormat<F>
where
    F: Fn(&mut fmt::Formatter) -> fmt::Result,
{
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        (self.0)(f)
    }
}

macro_rules! lazy_format {
    ($fmt:literal $(, $arg:expr)* $(,)?) => {
        crate::util::LazyFormat(move |f| write!(f, $fmt $(, $arg)*))
    };
}

pub(crate) use lazy_format;
