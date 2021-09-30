import React from "react";
import type { Interpolation, Theme } from "@emotion/react";

import { SMALLER_FONT_BREAKPOINT } from "../../GlobalStyle";


export const BASE_LOGO_MARGIN = "calc(var(--logo-margin) * var(--inner-header-height))";
export const BUTTONS_WIDTH = 138;

export const ButtonContainer: React.FC = ({ children }) => (
    <div css={{ display: "flex", height: "100%", position: "relative" }}>
        {children}
    </div>
);

type ActionIconProps = {
    onClick: () => void;
    title: string;
    extraCss?: Interpolation<Theme>;
};

/** A single button with icon in the header. */
export const ActionIcon: React.FC<ActionIconProps> = ({
    title,
    onClick,
    extraCss = {},
    children,
}) => (
    <div css={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        ...(extraCss as Record<string, unknown>),
    }}>
        <div
            title={title}
            onClick={onClick}
            css={{
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
        >{children}</div>
    </div>
);
