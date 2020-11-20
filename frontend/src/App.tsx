import React, { Suspense } from "react";
import { BrowserRouter as Router, Switch, Route, RouteComponentProps } from "react-router-dom";

import { RelayEnvironmentProvider } from "react-relay/hooks";
import { environment } from "./relay";

import { GlobalStyle } from "./GlobalStyle";
import { Root } from "./layout/Root";
import { Realm } from "./page/Realm";
import { NotFound } from "./page/NotFound";

export const App: React.FC = () => (
    <RelayEnvironmentProvider {...{ environment }}>
        <GlobalStyle />
        <Router>
            <Root>
                <Switch>
                    <Route exact path={["/", "/r/:path+"]} component={RealmPage} />
                    <Route exact path={["404", "*"]} component={NotFound} />
                </Switch>
            </Root>
        </Router>
    </RelayEnvironmentProvider>
);


const RealmPage: React.FC<RouteComponentProps<{ path?: string }>> = ({ match }) => (
    <Suspense fallback="Loading! (TODO)">
        <Realm path={match.params.path ?? ""} />
    </Suspense>
);
