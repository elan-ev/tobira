import React from 'react';
import { Link, useParams } from 'react-router-dom';


const MOVIE = { id: 1, name: "Scott Pilgrim vs. the World", year: 2010 };

export const Movies: React.FC = () => {
  const loading = false, error = false;
  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error!</p>;

  const movies = [MOVIE];

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

  const loading = false, error = false;
  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error!</p>;

  const movie = MOVIE;

  return <div id={id}>
    Name: {movie.name}
    <br />
    Year: {movie.year}
  </div>;
};
