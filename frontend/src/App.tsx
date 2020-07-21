import { createClient, Provider as UrqlProvider } from 'urql';
import React from 'react';
import {
  BrowserRouter as Router,
  Switch,
  Route,
} from "react-router-dom";

import { Movie, Movies } from './Movie';

export const App: React.FC = () => {
  const client = createClient({ url: '/graphql' })

  return (
    <UrqlProvider value={client}>
      <Router>
        <Switch>
          <Route path="/movie/:id">
            <Movie />
          </Route>
          <Route path="/">
            <h1>urgl showcase</h1>
            <Movies />
          </Route>
        </Switch>
      </Router>
    </UrqlProvider>
  );
};
