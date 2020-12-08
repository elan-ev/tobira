import React, { Suspense } from "react";
import { BrowserRouter as Router, Switch, Route, RouteComponentProps } from "react-router-dom";

import { RelayEnvironmentProvider } from "react-relay/hooks";
import { environment, APIError } from "./relay";

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

const HomeRoute: React.FC = () => (
    <APIWrapper>
        <HomePage />
    </APIWrapper>
);

const RealmRoute: React.FC<RouteComponentProps<{ path?: string }>> = ({ match }) => (
    <APIWrapper>
        <RealmPage path={match.params.path ?? ""} />
    </APIWrapper>
);


const APIWrapper: React.FC = ({ children }) => (
    <APIErrorBoundary>
        <Suspense fallback="Loading! (TODO)">
            {children}
        </Suspense>
    </APIErrorBoundary>
);

// TODO This is of course rather bare bones;
// it mainly serves to demonstrate what we have to do to **get to** the
// errors we might get from Relay, not necessarily how to handle them.
class APIErrorBoundary extends React.Component<unknown, boolean> {
    public constructor(props: unknown) {
        super(props);
        this.state = false;
    }

    public static getDerivedStateFromError(error: unknown) {
        if (error instanceof APIError) {
            // >= 400 response from the API
            return true;
        } else if (error instanceof Error && error.name === "RelayNetwork") {
            // **Probably** got no `data` in the API response.
            // However, there is no way to distinguish this from potential further errors
            // of the same "type", other than comparing messages (which contain data about
            // the request). Let's hope the Relay folks change that when they introduce
            // additional error scenarios in the future.
            return true;
        }
        // Not our problem
        return false;
    }

    public render() {
        return this.state
            ? "An error occured (TODO)"
            : this.props.children;
    }
}
