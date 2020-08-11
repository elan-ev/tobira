import React, { Suspense } from 'react';
import {
  BrowserRouter as Router,
  Switch,
  Route,
} from "react-router-dom";

import { Environment, Store, RecordSource, Network } from 'relay-runtime';
import { RelayEnvironmentProvider } from 'react-relay/hooks';

import { Movie, Movies } from './Movie';


const relayEnvironment = new Environment({
  // TODO What are thooose?!
  store: new Store(new RecordSource()),
  network: Network.create(({ text: query }, variables) =>
    fetch('/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    }).then(response => response.json())),
});

class ErrorBoundary extends React.PureComponent<unknown, { error?: boolean }> {
  constructor(props: unknown) {
    super(props);
    this.state = {};
  }

  static getDerivedStateFromError() {
    return { error: true };
  }

  render() {
    if (this.state.error) {
      return <p>An error occured!</p>;
    }

    return this.props.children;
  }
}

export const App: React.FC = () => {
  return (
    <RelayEnvironmentProvider environment={relayEnvironment}>
      <ErrorBoundary>
        <Suspense fallback="Loading ...">
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
        </Suspense>
      </ErrorBoundary>
    </RelayEnvironmentProvider>
  );
};
