import React, { Suspense } from "react";

import { RelayEnvironmentProvider } from "react-relay/hooks";
import { environment, ServerError, APIError } from "./relay";

import { GlobalStyle } from "./GlobalStyle";
import { Router } from "./router";
import type { MatchedRoute } from "./router";


type Props = {
    initialRoute: MatchedRoute<any>;
};

export const App: React.FC<Props> = ({ initialRoute }) => (
    <RelayEnvironmentProvider {...{ environment }}>
        <GlobalStyle />
        <APIWrapper>
            <Router initialRoute={initialRoute} />
        </APIWrapper>
    </RelayEnvironmentProvider>
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
