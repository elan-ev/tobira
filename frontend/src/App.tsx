import React, { ReactNode, StrictMode } from "react";
import { RelayEnvironmentProvider } from "react-relay/hooks";
import { CacheProvider } from "@emotion/react";
import createEmotionCache from "@emotion/cache";

import { GlobalErrorBoundary } from "./util/err";
import { environment } from "./relay";
import { GlobalStyle } from "./GlobalStyle";
import { ActiveRoute, Router } from "./router";
import { MatchedRoute } from "./rauta";
import { MenuProvider } from "./layout/MenuState";
import { GraphQLErrorBoundary } from "./relay/boundary";
import { LoadingIndicator } from "./ui/LoadingIndicator";
import { ColorSchemeProvider } from "@opencast/appkit";


type Props = {
    initialRoute: MatchedRoute;
};

export const App: React.FC<Props> = ({ initialRoute }) => (
    <StrictMode>
        <SilenceEmotionWarnings>
            <ColorSchemeProvider>
                <GlobalStyle />
                <GlobalErrorBoundary>
                    <RelayEnvironmentProvider {...{ environment }}>
                        <Router initialRoute={initialRoute}>
                            <GraphQLErrorBoundary>
                                <MenuProvider>
                                    <LoadingIndicator />
                                    <ActiveRoute />
                                </MenuProvider>
                            </GraphQLErrorBoundary>
                        </Router>
                    </RelayEnvironmentProvider>
                </GlobalErrorBoundary>
            </ColorSchemeProvider>
        </SilenceEmotionWarnings>
    </StrictMode>
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
const SilenceEmotionWarnings: React.FC<{ children: ReactNode }> = ({ children }) => {
    const cache = createEmotionCache({
        key: "css",
        nonce: document.documentElement.dataset.tobiraStyleNonce,
        ...(process.env.NODE_ENV === "development" && { stylisPlugins: [] }),
    });
    cache.compat = true;

    return <CacheProvider value={cache}>{children}</CacheProvider>;
};
