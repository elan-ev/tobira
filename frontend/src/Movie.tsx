import React from 'react';
import { Link, useParams } from 'react-router-dom';

import { graphql, useFragment, useLazyLoadQuery } from 'react-relay/hooks';
import { MoviesQuery } from './__generated__/MoviesQuery.graphql';
import { MovieList_movies$key } from './__generated__/MovieList_movies.graphql';
import { MovieListEntry_movie$key } from './__generated__/MovieListEntry_movie.graphql';
import { MovieQuery } from './__generated__/MovieQuery.graphql';


export const Movies: React.FC = () => {
  const data = useLazyLoadQuery<MoviesQuery>(graphql`
    query MoviesQuery {
      ... MovieList_movies
      oldestMovie {
        ... MovieListEntry_movie
      }
    }
  `, {});
  return <>
    <MovieList data={data} />

    <h1>Oldest movie</h1>
    <MovieListEntry movie={data.oldestMovie} />
  </>;
};

interface MovieListProps {
  data: MovieList_movies$key
}
const MovieList: React.FC<MovieListProps> = ({ data }: MovieListProps) => {
  const { movies } = useFragment(graphql`
    fragment MovieList_movies on Query {
      movies {
        id
        ... MovieListEntry_movie
      }
    }
  `, data);

  return <ul>
    {movies.map(movie => (
      <li key={movie.id}>
        <MovieListEntry movie={movie} />
      </li>
    ))}
  </ul>
};

interface MovieListEntryProps {
  movie: MovieListEntry_movie$key
}
const MovieListEntry: React.FC<MovieListEntryProps> = ({ movie }: MovieListEntryProps) => {
  const { id, name, year } = useFragment(graphql`
    fragment MovieListEntry_movie on Movie {
      id
      name
      year
    }
  `, movie);

  return <Link to={`/movie/${id}`}>{name} ({year})</Link>
};

export const Movie: React.FC = () => {
  const { id } = useParams();

  const { movie } = useLazyLoadQuery<MovieQuery>(graphql`
    query MovieQuery($id: Int!) {
      movie(id: $id) {
        name
        year
      }
    }
  `, { id: Number(id) });

  if (!movie) throw new Error('Movie not found');

  return <div id={id}>
    Name: {movie.name}
    <br />
    Year: {movie.year}
  </div>;
};
