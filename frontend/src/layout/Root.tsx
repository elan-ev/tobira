import React from "react";

import { Header } from "./Header";

export const MAIN_PADDING = 16;

export const Root: React.FC = ({ children }) => (
    <div>
        <Header />
        <main css={{ padding: MAIN_PADDING }}>{children}</main>
    </div>
);
