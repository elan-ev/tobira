import { useQuery } from 'urql';
import React from 'react';
import { Link, useParams } from "react-router-dom";



const ALL_MOVIES = `
  query {
    movies { id, name, year }
  }
`;
const MOVIE = `
  query ($id: Int!) {
    movie(id: $id) { name, year }
  }
`;

export const Movies: React.FC = () => {
  const [res,] = useQuery({ query: ALL_MOVIES });

  if (res.fetching) return <p>Loading...</p>;
  if (res.error) return <p>Error :(</p>;

  return <ul>
    {res.data.movies.map(({ id, name, year }) => (
      <li key={name}>
        <Link to={`/movie/${id}`}>{name} ({year})</Link>
      </li>
    ))}
  </ul>
};

export const Movie: React.FC = () => {
  const { id } = useParams();
  const [res,] = useQuery({ query: MOVIE, variables: { id: Number(id) }});

  if (res.fetching) return <p>Loading...</p>;
  if (res.error) return <p>Error :(</p>;

  return <div>
    Name: {res.data.movie.name}
    <br />
    Year: {res.data.movie.year}
  </div>;
};
