import { jsx } from "@emotion/core";
import React from "react";

import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { Breadcrumbs } from "./Breadcrumbs";


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
                <Breadcrumbs path={DUMMY_PATH} />
                main :)
            </main>
        </div>
    );
};

const DUMMY_PATH = [
    { label: "Lectures", href: "/r/lectures" },
    { label: "Math", href: "/r/lectures/math" },
    { label: "Algebra I", href: "/r/lectures/math/algebra" },
];
