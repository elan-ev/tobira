import { jsx } from "@emotion/core";
import React from "react";

import { Header } from "./Header";
import { Sidebar } from "./Sidebar";


const HEADER_HEIGHT = 60;
const SIDEBAR_WIDTH = 250;

export const Root: React.FC = () => {
    return (
        <div css={{
            display: "grid",
            height: "100vh",
            width: "100vw",
            grid: `
                "header    header"  ${HEADER_HEIGHT}px
                "sidebar   main"    1fr
                / ${SIDEBAR_WIDTH}px 1fr
            `,

        }}>
            <Header gridArea="header" />
            <Sidebar gridArea="sidebar" />
            <main css={{ gridArea: "main", padding: 16 }}>
                main :)
            </main>
        </div>
    );
};
