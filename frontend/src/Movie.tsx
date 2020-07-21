import { gql, useQuery } from '@apollo/client';
import React from 'react';
import { Link, useParams } from "react-router-dom";
import { useAllMoviesQuery, useFindMovieQuery } from './generated/graphql';


export const Movies: React.FC = () => {
  const { loading, error, data } = useAllMoviesQuery();

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error :(</p>;

  return <ul>
    {data!.movies.map(({ id, name, year }) => (
      <li key={name}>
        <Link to={`/movie/${id}`}>{name} ({year})</Link>
      </li>
    ))}
  </ul>
};

export const Movie: React.FC = () => {
  const { id } = useParams();
  const { loading, error, data } = useFindMovieQuery();

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error :(</p>;

  if (!data!.movie) {
    return <div>"Movie not found!"</div>;
  }

  return <div>
    Name: {data!.movie.name}
    <br />
    Year: {data!.movie.year}
  </div>;
};
