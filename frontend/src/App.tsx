import { jsx } from "@emotion/core";
import React from "react";

import { GlobalStyle } from "./GlobalStyle";
import { Root } from "./layout/Root";

export const App: React.FC = () => {
    return <>
        <GlobalStyle />
        <Root />
    </>;
};
