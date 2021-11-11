import React, { Suspense } from "react";
import { RelayEnvironmentProvider } from "react-relay/hooks";
import { CacheProvider } from "@emotion/react";
import createEmotionCache from "@emotion/cache";

import { environment } from "./relay";
import { GlobalStyle } from "./GlobalStyle";
import { ActiveRoute, Router } from "./router";
import { MatchedRouteErased } from "./rauta";
import { MenuProvider } from "./layout/MenuState";
import { InitialLoading } from "./layout/Root";
import { GraphQLErrorBoundary } from "./relay/boundary";



type Props = {
    initialRoute: MatchedRouteErased;
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
    <GraphQLErrorBoundary>
        <Suspense fallback={<InitialLoading />}>
            {children}
        </Suspense>
    </GraphQLErrorBoundary>
);
