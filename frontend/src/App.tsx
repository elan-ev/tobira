import React from "react";
import { BrowserRouter as Router, Switch, Route, RouteComponentProps } from "react-router-dom";

import { GlobalStyle } from "./GlobalStyle";
import { Root } from "./layout/Root";
import { Realm } from "./page/Realm";
import { NotFound } from "./page/NotFound";

export const App: React.FC = () => <>
    <GlobalStyle />
    <Router>
        <Root>
            <Switch>
                <Route exact path={["/", "/r/:path+"]} component={RealmPage} />
                <Route exact path={["404", "*"]} component={NotFound} />
            </Switch>
        </Root>
    </Router>
</>;


const RealmPage: React.FC<RouteComponentProps<{ path?: string }>> = ({ match }) => (
    <Realm path={match.params.path?.split("/") ?? []} />
);
