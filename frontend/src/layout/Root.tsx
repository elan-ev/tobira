import React from "react";
import { keyframes } from "@emotion/react";
import { useTranslation } from "react-i18next";

import { Header } from "./Header";
import { DesktopNav, MobileNav, BREAKPOINT as NAV_BREAKPOINT } from "./Navigation";
import type { NavSource } from "./Navigation";
import { useMenu } from "./MenuState";
import { Footer } from "./Footer";
import { BurgerMenu } from "./Burger";
import { SideBox } from "../ui";


export const MAIN_PADDING = 16;

// This funky expressions just means: above a screen width of 1100px, the extra
// space will be 10% margin left and right. This is the middle ground between
// filling the full screen and having a fixed max width.
export const OUTER_CONTAINER_MARGIN = "0 calc(max(0px, 100% - 1100px) * 0.1)";

type Props = {
    navSource: NavSource;
    belowNav?: JSX.Element;
};

export const Root: React.FC<Props> = ({ navSource, belowNav = null, children }) => {
    const menu = useMenu();

    return (
        <Outer disableScrolling={menu.state === "burger"}>
            <Header />
            {menu.state === "burger" && (
                <BurgerMenu hide={() => menu.close()}>
                    <MobileNav source={navSource} />
                    {belowNav}
                </BurgerMenu>
            )}
            <Main>
                <div css={{
                    flex: "1 0 12.5%",
                    minWidth: 240,
                    maxWidth: 360,
                    marginRight: 32,
                    [`@media (max-width: ${NAV_BREAKPOINT}px)`]: {
                        display: "none",
                    },
                }}>
                    <SideBox><DesktopNav source={navSource} /></SideBox>
                    {belowNav && <SideBox>{belowNav}</SideBox>}
                </div>
                <div css={{
                    width: "100%",
                    flex: "12 0 0",
                    "& > h1": { margin: "12px 0" },
                    "& > h1:first-child": { marginTop: 0 },
                }}>
                    {children}
                </div>
            </Main>
            <Footer />
        </Outer>
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
