import React from "react";

import { Header } from "./Header";


export const Root: React.FC = ({ children }) => {
    return (
        <div>
            <Header />
            <main css={{ padding: 16 }}>{children}</main>
        </div>
    );
};
