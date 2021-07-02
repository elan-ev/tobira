import React from "react";

import { Header } from "./Header";
import { DesktopNav, MobileNav, BREAKPOINT as NAV_BREAKPOINT } from "./Navigation";
import type { NavSource } from "./Navigation";
import { useMenu } from "./MenuState";


export const MAIN_PADDING = 16;

// This funky expressions just means: above a screen width of 1100px, the extra
// space will be 10% margin left and right. This is the middle ground between
// filling the full screen and having a fixed max width.
export const OUTER_CONTAINER_MARGIN = "0 calc(max(0px, 100% - 1100px) * 0.1)";

type Props = {
    navSource: NavSource;
};

export const Root: React.FC<Props> = ({ navSource, children }) => {
    const menu = useMenu();

    return (
        <div css={{
            margin: OUTER_CONTAINER_MARGIN,
            ...menu.state === "burger" && {
                overflow: "hidden",
                height: "100vh",
            },
        }}>
            <Header />
            {menu.state === "burger" && <MobileNav source={navSource} hide={() => menu.close()} />}
            <main css={{
                padding: MAIN_PADDING,
                display: "flex",
                alignItems: "flex-start",
            }}>
                <DesktopNav source={navSource} layoutCss={{
                    flex: "1 0 12.5%",
                    minWidth: 240,
                    maxWidth: 360,
                    marginRight: 32,
                    [`@media (max-width: ${NAV_BREAKPOINT}px)`]: {
                        display: "none",
                    },
                }} />
                <div css={{
                    flex: "12 0 0",
                    "& > h1": { margin: "12px 0" },
                    "& > h1:first-child": { marginTop: 0 },
                }}>
                    {children}
                </div>
            </main>
        </div>
    );
};

