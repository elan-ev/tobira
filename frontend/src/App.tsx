import React, { Suspense } from "react";
import { BrowserRouter as Router, Switch, Route } from "react-router-dom";
import type { RouteComponentProps } from "react-router-dom";

import { RelayEnvironmentProvider } from "react-relay/hooks";
import { environment, ServerError, APIError } from "./relay";

import { GlobalStyle } from "./GlobalStyle";
import { Root } from "./layout/Root";
import { RealmPage } from "./page/Realm";
import { HomePage } from "./page/Home";
import { VideoPage } from "./page/Video";
import { NotFound } from "./page/NotFound";
import { About } from "./page/About";


export const App: React.FC = () => (
    <RelayEnvironmentProvider {...{ environment }}>
        <GlobalStyle />
        <Router>
            <Root>
                <Switch>
                    <Route exact path="/" component={HomeRoute} />
                    <Route exact path="/about" component={About} />
                    <Route path="/r/:path+" component={RealmRoute} />
                    <Route exact path="/v/:id" component={VideoRoute} />
                    <Route component={NotFound} />
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

const VideoRoute: React.FC<RouteComponentProps<{ id: string }>> = ({ match }) => (
    <APIWrapper>
        <VideoPage id={match.params.id} />
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
        if (error instanceof ServerError) {
            // >= 400 response from the API
            return true;
        } else if (error instanceof APIError) {
            // OK response, but it contained GraphQL errors.
            // It might be a good idea to handle these in more specific error boundaries.
            // For now, though, we just lump it in with the rest.
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
