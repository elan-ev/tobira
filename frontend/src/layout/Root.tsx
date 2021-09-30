import React from "react";
import { keyframes } from "@emotion/react";
import { useTranslation } from "react-i18next";

import { Header } from "./header";
import { BREAKPOINT as NAV_BREAKPOINT } from "./Navigation";
import { useMenu } from "./MenuState";
import { Footer } from "./Footer";
import { BurgerMenu } from "./Burger";
import { SideBox } from "../ui";
import { OUTER_CONTAINER_MARGIN } from ".";
import { UserProvider, UserQueryRef } from "../User";


export const MAIN_PADDING = 16;

type Props = {
    nav: JSX.Element | JSX.Element[];
    userQuery?: UserQueryRef;
};

export const Root: React.FC<Props> = ({ nav, userQuery, children }) => {
    const menu = useMenu();
    const navElements = Array.isArray(nav) ? nav : [nav];
    const navExists = navElements.length > 0;

    return (
        <UserProvider fragRef={userQuery}>
            <Outer disableScrolling={menu.state === "burger"}>
                <Header hideNavIcon={!navExists} />
                {menu.state === "burger" && navExists && (
                    <BurgerMenu hide={() => menu.close()}>{navElements}</BurgerMenu>
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
                    <div css={{
                        width: "100%",
                        // To prevent a child growing this div larger than 100% in width
                        overflow: "hidden",
                        flex: "12 0 0",
                        "& > h1:first-child": { marginBottom: 12 },
                    }}>
                        {children}
                    </div>
                </Main>
                <Footer />
            </Outer>
        </UserProvider>
    );
};

type OuterProps = {
    disableScrolling?: boolean;
};

const Outer: React.FC<OuterProps> = ({ children, disableScrolling = false }) => (
    <div css={{
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        ...disableScrolling && {
            overflow: "hidden",
            height: "100%",
        },
    }}>{children}</div>
);

const Main: React.FC = ({ children }) => (
    <main css={{
        margin: OUTER_CONTAINER_MARGIN,
        padding: MAIN_PADDING,
        flexGrow: 1,
        display: "flex",
        alignItems: "flex-start",
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
