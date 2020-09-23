import { jsx } from "@emotion/core";
import React from "react";
import { BrowserRouter as Router, Switch, Route, Link } from "react-router-dom";

import { GlobalStyle } from "./GlobalStyle";
import { Root } from "./layout/Root";
import { Realm } from "./page/Realm";
import { NotFound } from "./page/NotFound";

export const App: React.FC = () => {
    return <React.Fragment>
        <GlobalStyle />
        <Router>
            <Root>
                <Switch>
                    <Route path={["/", "/r/:path+"]} exact component={Realm} />
                    <Route path={["404", "*"]} exact component={NotFound} />
                </Switch>
            </Root>
        </Router>
    </React.Fragment>;
};
