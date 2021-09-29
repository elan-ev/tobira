/// Helper to pass to `query_raw` as parameters argument when you don't want to
/// pass any parameters. It's shorter and more descriptive than
/// `std::iter::empty()` and it has no problems with type inference.
pub struct NoParams;

impl Iterator for NoParams {
    type Item = bool;
    fn next(&mut self) -> Option<Self::Item> {
        None
    }
    fn size_hint(&self) -> (usize, Option<usize>) {
        (0, Some(0))
    }
}

impl ExactSizeIterator for NoParams {}
