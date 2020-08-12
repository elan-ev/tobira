import React from 'react';
import { Link, useParams } from "react-router-dom";
import { useMoviePageQuery, useFindMovieQuery, Movie } from './generated/graphql';


export const MoviePage: React.FC = () => {
  const { loading, error, data } = useMoviePageQuery();

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error :(</p>;

  return <>
    <OldestMovie movieName={data!.oldestMovie.name} />
    <MovieList movies={data!.movies} />
  </>;
};

export const SingleMovie: React.FC = () => {
  const { id } = useParams();
  const { loading, error, data } = useFindMovieQuery({ variables: { id: Number(id) } });

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error :(</p>;

  if (!data!.movie) {
    return <div>Movie not found!</div>;
  }

  return <div>
    Name: {data!.movie.name}
    <br />
    Year: {data!.movie.year}
  </div>;
};

const OldestMovie: React.FC<{ movieName: string }> = ({ movieName }) => {
  return <div>
    Oldest movie: {movieName}
  </div>;
};

const MovieList: React.FC<{ movies: Movie[] }> = ({ movies }) => {
  return <ul>
    {movies.map(({ id, name, year }) => (
      <li key={name}>
        <Link to={`/movie/${id}`}>{name} ({year})</Link>
      </li>
    ))}
  </ul>
};
