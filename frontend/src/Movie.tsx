import React from 'react';
import { Link, useParams } from 'react-router-dom';

import { graphql, useLazyLoadQuery } from 'react-relay/hooks';
import { MovieQuery } from './__generated__/MovieQuery.graphql';
import { MoviesQuery } from './__generated__/MoviesQuery.graphql';


export const Movies: React.FC = () => {
  const { movies } = useLazyLoadQuery<MoviesQuery>(graphql`
    query MoviesQuery {
      movies {
        id
        name
        year
      }
    }
  `, {});

  return <ul>
    {movies.map(({ id, name, year }) => (
      <li key={id}>
        <Link to={`/movie/${id}`}>{name} ({year})</Link>
      </li>
    ))}
  </ul>
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
