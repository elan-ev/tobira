import React, { ReactNode, Suspense } from "react";
import { keyframes } from "@emotion/react";
import { useTranslation } from "react-i18next";

import { Header } from "./header";
import { BREAKPOINT as NAV_BREAKPOINT, NavItems } from "./Navigation";
import { useMenu } from "./MenuState";
import { Footer } from "./Footer";
import { BurgerMenu } from "./Burger";
import { SideBox } from "../ui";
import { OUTER_CONTAINER_MARGIN } from ".";
import { userDataFragment, UserProvider } from "../User";
import { GraphQLTaggedNode, PreloadedQuery, useFragment, usePreloadedQuery } from "react-relay";
import { OperationType } from "relay-runtime";
import { UserData$key } from "../__generated__/UserData.graphql";
import { useNoindexTag } from "../util";


export const MAIN_PADDING = 16;

type Props = {
    nav: NavItems;
    children: ReactNode;
};

export const Root: React.FC<Props> = ({ nav, children }) => {
    const menu = useMenu();
    const navElements = Array.isArray(nav) ? nav : [nav] as const;
    const navExists = navElements.length > 0;

    return (
        <Outer disableScrolling={menu.state === "burger"}>
            <Header hideNavIcon={!navExists} />
            {menu.state === "burger" && navExists && (
                <BurgerMenu items={navElements} hide={() => menu.close()} />
            )}
            <Main>
                {/* Sidebar */}
                {navExists && <div css={{
                    flex: "1 0 12.5%",
                    minWidth: 240,
                    maxWidth: 360,
                    marginRight: 48,
                    [`@media (max-width: ${NAV_BREAKPOINT}px)`]: {
                        display: "none",
                    },
                }}>
                    {navElements.map((elem, i) => <SideBox key={i}>{elem}</SideBox>)}
                </div>}

                {/* Main part */}
                <div css={{ width: "100%", minWidth: 0, flex: "12 0 0" }}>
                    {children}
                </div>
            </Main>
            <Footer />
        </Outer>
    );
};

type OuterProps = {
    disableScrolling?: boolean;
    children: ReactNode;
};

export const Outer: React.FC<OuterProps> = ({ children, disableScrolling = false }) => (
    <div css={{
        minHeight: "100%",
        maxWidth: 2290,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        ...disableScrolling && {
            overflow: "hidden",
            height: "100%",
        },
    }}>{children}</div>
);

const Main: React.FC<{ children: ReactNode }> = ({ children }) => (
    <main css={{
        margin: OUTER_CONTAINER_MARGIN,
        padding: MAIN_PADDING,
        flexGrow: 1,
        display: "flex",
        alignItems: "stretch",
    }}>{children}</main>
);

export const InitialLoading: React.FC = () => {
    const { t } = useTranslation();
    const pulsing = keyframes({
        "0%": { opacity: 0.5 },
        "50%": { opacity: 1 },
        "100%": { opacity: 0.5 },
    });

    return (
        <Outer>
            <Header />
            <Main>
                <div css={{ margin: "auto", marginTop: "min(120px, 20vh)" }}>
                    <div css={{
                        marginTop: 32,
                        animation: `${pulsing} 1.2s infinite`,
                        fontSize: 20,
                    }}>{t("loading")}</div>
                </div>
            </Main>
            <Footer />
        </Outer>
    );
};

/** A query that contains user data needed for the header */
interface QueryWithUserData extends OperationType {
    response: UserData$key;
}

type RootLoaderProps<Q extends QueryWithUserData> = {
    query: GraphQLTaggedNode;
    queryRef: PreloadedQuery<Q>;
    nav: (data: Q["response"]) => NavItems;
    render: (data: Q["response"]) => JSX.Element;
    /** If set to `true`, a `<meta name="robots" content="noindex">` tag is added. */
    noindex?: boolean;
};

/** Entry point for almost all routes: loads the GraphQL query and renders the main page layout */
export const RootLoader = <Q extends QueryWithUserData>(props: RootLoaderProps<Q>) => (
    <Suspense fallback={<InitialLoading />}>
        <RootLoaderImpl {...props} />
    </Suspense>
);

export const RootLoaderImpl = <Q extends QueryWithUserData>({
    query,
    queryRef,
    nav,
    render,
    noindex = false,
}: RootLoaderProps<Q>) => {
    useNoindexTag(noindex);
    const data = usePreloadedQuery(query, queryRef);
    const userData = useFragment(userDataFragment, data);

    return (
        <UserProvider data={userData?.currentUser}>
            <Root nav={nav(data)}>{render(data)}</Root>
        </UserProvider>
    );
};
