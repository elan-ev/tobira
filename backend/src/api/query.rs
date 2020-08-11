use super::Context;

/// The root query object.
pub struct Query;

#[juniper::graphql_object(Context = Context)]
impl Query {
    fn apiVersion() -> &str {
        "0.0"
    }

    fn movies() -> &[Movie] {
        MOVIES
    }

    fn movie(id: i32) -> Option<Movie> {
        MOVIES.get(id as usize).copied()
    }

    fn oldestMovie() -> Movie {
        *MOVIES.iter().min_by_key(|m| m.year).unwrap()
    }
}

#[derive(Debug, Clone, Copy, juniper::GraphQLObject)]
struct Movie {
    // TODO Use `juniper::ID`?
    id: &'static str,
    name: &'static str,
    year: i32,
}

const MOVIES: &[Movie] = &[
    Movie { id: "0", name: "The Prestige", year: 2006 },
    Movie { id: "1", name: "Ghost in the Shell", year: 1995 },
    Movie { id: "2", name: "Atonement", year: 2007 },
    Movie { id: "3", name: "I Origins", year: 2014 },
];
