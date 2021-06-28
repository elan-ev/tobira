import React, { useState } from "react";

import { Header } from "./Header";
import { MobileNav } from "./Navigation";
import type { Navigation } from "./Navigation";

export const MAIN_PADDING = 16;


type Props = {
    nav: Navigation;
};

export const Root: React.FC<Props> = ({ nav, children }) => {
    const [burgerVisible, setBurgerVisible] = useState(false);

    return (
        <div css={{
            // This funky expressions just means: above a screen width of 1100px,
            // the extra space will be 10% margin left and right. This is the middle
            // ground between filling the full screen and having a fixed max width.
            margin: "0 calc(max(0px, 100% - 1100px) * 0.1)",

            ...burgerVisible && {
                overflow: "hidden",
                height: "100vh",
            },
        }}>
            <Header setBurgerVisible={setBurgerVisible} burgerVisible={burgerVisible} />
            {burgerVisible && <MobileNav nav={nav} hide={() => setBurgerVisible(false)} />}
            <main css={{ padding: MAIN_PADDING }}>
                {children}
            </main>
        </div>
    );
};
