import React from 'react';
import {
  BrowserRouter as Router,
  Switch,
  Route,
} from "react-router-dom";

import { Movie, Movies } from './Movie';

export const App: React.FC = () => {
  return (
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
  );
};
