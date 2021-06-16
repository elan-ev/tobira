import React from "react";

import { Header } from "./Header";

export const MAIN_PADDING = 16;

export const Root: React.FC = ({ children }) => (
    <div css={{
        // This funky expressions just means: above a screen width of 1100px,
        // the extra space will be 10% margin left and right. This is the middle
        // ground between filling the full screen and having a fixed max width.
        margin: "0 calc(max(0px, 100% - 1100px) * 0.1)",
    }}>
        <Header />
        <main css={{ padding: MAIN_PADDING }}>{children}</main>
    </div>
);
