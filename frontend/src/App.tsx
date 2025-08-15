import React, { ReactNode, StrictMode, Suspense } from "react";
import { HotkeysProvider } from "react-hotkeys-hook";
import { RelayEnvironmentProvider } from "react-relay/hooks";
import { CacheProvider } from "@emotion/react";
import createEmotionCache from "@emotion/cache";


import { GlobalErrorBoundary } from "./util/err";
import { environment } from "./relay";
import { GlobalStyle } from "./GlobalStyle";
import { ActiveRoute, Router } from "./router";
import { RouteMatchInfo } from "./rauta";
import { MenuProvider } from "./layout/MenuState";
import { GraphQLErrorBoundary } from "./relay/boundary";
import { LoadingIndicator } from "./ui/LoadingIndicator";
import {
    AppkitConfig,
    AppkitConfigProvider,
    ColorSchemeProvider,
    DEFAULT_CONFIG,
} from "@opencast/appkit";
import { COLORS } from "./color";
import { InitialConsent } from "./ui/InitialConsent";
import { InitialLoading } from "./layout/Root";
import { NotificationProvider } from "./ui/NotificationContext";
import { DevConfig } from "./DevConfig";


type Props = {
    initialRoute: RouteMatchInfo;
    consentGiven: boolean | null;
};

export const App: React.FC<Props> = ({ initialRoute, consentGiven }) => (
    <StrictMode>
        <SilenceEmotionWarnings>
            <ColorSchemeProvider allowedSchemes={["light", "dark"]}>
                <AppkitConfigProvider config={APPKIT_CONFIG}>
                    <GlobalStyle />
                    <GlobalErrorBoundary>
                        <RelayEnvironmentProvider {...{ environment }}>
                            <HotkeysProvider initiallyActiveScopes={["general"]}>
                                <DevConfig>
                                    <Router initialRoute={initialRoute}>
                                        <GraphQLErrorBoundary>
                                            <MenuProvider>
                                                <NotificationProvider>
                                                    <LoadingIndicator />
                                                    <InitialConsent {...{ consentGiven }} />
                                                    <Suspense fallback={<InitialLoading />}>
                                                        <ActiveRoute />
                                                    </Suspense>
                                                </NotificationProvider>
                                            </MenuProvider>
                                        </GraphQLErrorBoundary>
                                    </Router>
                                </DevConfig>
                            </HotkeysProvider>
                        </RelayEnvironmentProvider>
                    </GlobalErrorBoundary>
                </AppkitConfigProvider>
            </ColorSchemeProvider>
        </SilenceEmotionWarnings>
    </StrictMode>
);

const APPKIT_CONFIG: AppkitConfig = {
    ...DEFAULT_CONFIG,
    colors: {
        ...DEFAULT_CONFIG.colors,

        accent7: COLORS.primary0,
        accent8: COLORS.primary1,
        accent9: COLORS.primary2,
        accent7BwInverted: COLORS.primary0BwInverted,
        accent8BwInverted: COLORS.primary1BwInverted,
        accent9BwInverted: COLORS.primary2BwInverted,

        happy7: COLORS.primary0,
        happy8: COLORS.primary1,
        happy9: COLORS.primary2,
        happy7BwInverted: COLORS.primary0BwInverted,
        happy8BwInverted: COLORS.primary1BwInverted,
        happy9BwInverted: COLORS.primary2BwInverted,

        danger4: COLORS.danger0,
        danger5: COLORS.danger1,
        danger4BwInverted: COLORS.danger0BwInverted,
        danger5BwInverted: COLORS.danger1BwInverted,

        focus: COLORS.focus,
    },
};

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
