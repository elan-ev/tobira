import React, { Suspense } from "react";

import { RelayEnvironmentProvider } from "react-relay/hooks";
import { environment, ServerError, APIError } from "./relay";

import { GlobalStyle } from "./GlobalStyle";
import { ActiveRoute, Router } from "./router";
import type { MatchedRoute } from "./router";
import { MenuProvider } from "./layout/MenuState";
import { CacheProvider } from "@emotion/react";
import createEmotionCache from "@emotion/cache";


type Props = {
    initialRoute: MatchedRoute<any>;
};

export const App: React.FC<Props> = ({ initialRoute }) => (
    <RelayEnvironmentProvider {...{ environment }}>
        <GlobalStyle />
        <SilenceEmotionWarnings>
            <Router initialRoute={initialRoute}>
                <APIWrapper>
                    <MenuProvider>
                        <ActiveRoute />
                    </MenuProvider>
                </APIWrapper>
            </Router>
        </SilenceEmotionWarnings>
    </RelayEnvironmentProvider>
);

/**
 * This thingy is kind of sad. In short: emotion-js emits warnings whenever one
 * uses `:first-child` selectors in CSS. That's because stuff can break when
 * doing server side rendering and using those selectors, since emotion will
 * insert `<style>` tags. This is the best way to disable the warning globally.
 * We don't need that warning because we won't do SSR.
 *
 * Full story: https://github.com/emotion-js/emotion/issues/1105
 */
const SilenceEmotionWarnings: React.FC = ({ children }) => {
    const cache = createEmotionCache({ key: "css" });
    cache.compat = true;

    return <CacheProvider value={cache}>{children}</CacheProvider>;
};

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
