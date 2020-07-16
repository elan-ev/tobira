import { gql, useQuery } from '@apollo/client';
import React from 'react';
import { Link, useParams } from "react-router-dom";



const ALL_MOVIES = gql`
  query {
    movies { id, name, year }
  }
`;
const MOVIE = gql`
  query ($id: Int!) {
    movie(id: $id) { name, year }
  }
`;

export const Movies: React.FC = () => {
  const { loading, error, data } = useQuery(ALL_MOVIES);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error :(</p>;

  return <ul>
    {data.movies.map(({ id, name, year }) => (
      <li key={name}>
        <Link to={`/movie/${id}`}>{name} ({year})</Link>
      </li>
    ))}
  </ul>
};

export const Movie: React.FC = () => {
  const { id } = useParams();
  const { loading, error, data } = useQuery(MOVIE, { variables: { id: Number(id) }});

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error :(</p>;

  return <div>
    Name: {data.movie.name}
    <br />
    Year: {data.movie.year}
  </div>;
};
