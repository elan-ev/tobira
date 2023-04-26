import React, { ReactNode } from "react";

import { BREAKPOINT_SMALL } from "../../GlobalStyle";
import { focusStyle } from "../../ui";
import { useTitle } from "../../util";
import { COLORS } from "../../color";


export const HEADER_BASE_PADDING = 24;

export const ButtonContainer: React.FC<{ children: ReactNode }> = ({ children }) => (
    <div css={{
        display: "flex",
        position: "relative",
        alignItems: "center",
        gap: 8,
        [`@media (max-width: ${BREAKPOINT_SMALL}px)`]: { gap: 4 },
    }}>
        {children}
    </div>
);

type ActionIconProps = {
    onClick?: () => void;
    title: string;
    className?: string;
    children: ReactNode;
};

export const ICON_STYLE = {
    border: "none",
    background: "none",
    padding: 5,
    margin: 0,
    borderRadius: 6,
    lineHeight: 0,
    cursor: "pointer",
    fontSize: 28,
    opacity: "0.75",
    ":hover, :focus": { opacity: 1 },
    ":hover": { outline: `2px solid ${COLORS.grey4}` },
    ...focusStyle({}),
    [`@media (max-width: ${BREAKPOINT_SMALL}px)`]: { fontSize: 24 },
};

/** A single button with icon in the header. */
export const ActionIcon = React.forwardRef<HTMLDivElement, ActionIconProps>(
    ({ title, onClick, children, className }, ref) => (
        <div ref={ref} {...{ className }} css={{
            height: "100%",
            display: "flex",
            alignItems: "center",
        }}>
            <button
                title={title}
                onClick={onClick}
                css={ICON_STYLE}
            >{children}</button>
        </div>
    ),
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
