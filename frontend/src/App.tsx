import { ApolloClient, ApolloProvider, InMemoryCache } from '@apollo/client';
import React from 'react';
import {
  BrowserRouter as Router,
  Switch,
  Route,
} from "react-router-dom";

import { Movie, Movies } from './Movie';

export const App: React.FC = () => {
  const client = new ApolloClient({
    uri: '/graphql',
    cache: new InMemoryCache(),
  });

  return (
    <ApolloProvider client={client}>
      <Router>
        <Switch>
          <Route path="/movie/:id">
            <Movie />
          </Route>
          <Route path="/">
            <Movies />
          </Route>
        </Switch>
      </Router>
    </ApolloProvider>
  );
};
