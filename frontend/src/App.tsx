import React, { Suspense } from "react";
import { BrowserRouter as Router, Switch, Route, RouteComponentProps } from "react-router-dom";

import { RelayEnvironmentProvider } from "react-relay/hooks";
import { environment } from "./relay";

import { GlobalStyle } from "./GlobalStyle";
import { Root } from "./layout/Root";
import { RealmPage } from "./page/Realm";
import { HomePage } from "./page/Home";
import { NotFound } from "./page/NotFound";

export const App: React.FC = () => (
    <RelayEnvironmentProvider {...{ environment }}>
        <GlobalStyle />
        <Router>
            <Root>
                <Switch>
                    <Route exact path="/" component={HomeRoute} />
                    <Route exact path="/r/:path+" component={RealmRoute} />
                    <Route exact path={["404", "*"]} component={NotFound} />
                </Switch>
            </Root>
        </Router>
    </RelayEnvironmentProvider>
);

const HomeRoute: React.FC<RouteComponentProps<{ path?: string }>> = ({ match }) => (
    <Suspense fallback="Loading! (TODO)">
        <HomePage />
    </Suspense>
);

const RealmRoute: React.FC<RouteComponentProps<{ path?: string }>> = ({ match }) => (
    <Suspense fallback="Loading! (TODO)">
        <RealmPage path={match.params.path ?? ""} />
    </Suspense>
);
