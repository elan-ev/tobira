import React, { ReactNode } from "react";

import { SMALLER_FONT_BREAKPOINT } from "../../GlobalStyle";
import { useTitle } from "../../util";


export const BASE_LOGO_MARGIN = "calc(var(--logo-margin) * var(--inner-header-height))";
export const BUTTONS_WIDTH = 138;

export const ButtonContainer: React.FC<{ children: ReactNode }> = ({ children }) => (
    <div css={{ display: "flex", height: "100%", position: "relative" }}>
        {children}
    </div>
);

type ActionIconProps = {
    onClick?: () => void;
    title: string;
    className?: string;
    children: ReactNode;
};

/** A single button with icon in the header. */
export const ActionIcon: React.FC<ActionIconProps> = ({ title, onClick, children, className }) => (
    <div {...{ className }} css={{
        height: "100%",
        display: "flex",
        alignItems: "center",
    }}>
        <button
            title={title}
            onClick={onClick}
            css={{
                border: "none",
                background: "none",
                padding: 5,
                margin: "0 4px",
                borderRadius: 4,
                lineHeight: 0,
                cursor: "pointer",
                fontSize: 28,
                opacity: "0.75",
                "&:hover": {
                    opacity: "1",
                },
                [`@media (max-width: ${SMALLER_FONT_BREAKPOINT}px)`]: {
                    fontSize: 24,
                },
            }}
        >{children}</button>
    </div>
);

type PageTitleProps = {
    title: string;
    className?: string;
};

/** A `h1` wrapper that calls `useTitle` */
export const PageTitle: React.FC<PageTitleProps> = ({ title, className }) => {
    useTitle(title);
    return <h1 {...{ className }}>{title}</h1>;
};
