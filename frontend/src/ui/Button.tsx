import { Interpolation, Theme } from "@emotion/react";
import React from "react";

import { Link } from "../router";
import { match } from "../util";


/**
 * A mostly unstyled button used to build buttons. Always use this instead of
 * `<button>`.
 */
export const ProtoButton = React.forwardRef<HTMLButtonElement, JSX.IntrinsicElements["button"]>(
    ({ children, ...rest }, ref) => <button
        type="button"
        ref={ref}
        css={PROTO_CSS}
        {...rest}
    >{children}</button>,
);


type Kind = "normal" | "danger" | "happy";

type ButtonProps = JSX.IntrinsicElements["button"] & {
    kind?: Kind;
    extraCss?: Interpolation<Theme>;
};

/** A styled button */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ kind = "normal", extraCss, children, ...rest }, ref) => (
        <button ref={ref} type="button" css={css(kind, extraCss)} {...rest}>{children}</button>
    ),
);

type LinkButtonProps = JSX.IntrinsicElements["a"] & {
    to: string;
    kind?: Kind;
    extraCss?: Interpolation<Theme>;
};

export const LinkButton: React.FC<LinkButtonProps> = ({
    kind = "normal",
    extraCss,
    to,
    children,
    ...rest
}) => (
    <Link to={to} css={css(kind, extraCss)} {...rest}>{children}</Link>
);

const PROTO_CSS = {
    border: "none",
    padding: 0,
    background: "none",
    color: "inherit",
    cursor: "pointer",
} as const;

const css = (kind: Kind, extraCss: Interpolation<Theme> = {}): Interpolation<Theme> => {
    const notDisabledStyle = match(kind, {
        "normal": () => ({
            border: "1px solid var(--grey65)",
            color: "black",
            "&:hover, &:focus": {
                border: "1px solid var(--grey40)",
                backgroundColor: "var(--grey92)",
            },
        }),

        "danger": () => ({
            border: "1px solid var(--danger-color)",
            color: "var(--danger-color)",
            "&:hover, &:focus": {
                border: "1px solid var(--danger-color-darker)",
                backgroundColor: "var(--danger-color)",
                color: "var(--danger-color-bw-contrast)",
            },
        }),

        "happy": () => ({
            border: "1px solid var(--happy-color-dark)",
            color: "var(--happy-color-bw-contrast)",
            backgroundColor: "var(--happy-color)",
            "&:hover, &:focus": {
                border: "1px solid var(--happy-color-dark)",
                backgroundColor: "var(--happy-color-darker)",
                color: "var(--happy-color-bw-contrast)",
            },
        }),
    });

    return {
        borderRadius: 4,
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        gap: 12,
        whiteSpace: "nowrap",
        backgroundColor: "var(--grey97)",
        transition: "background-color 0.15s, border-color 0.15s",
        "& > svg": {
            fontSize: 20,
        },
        "&:disabled": {
            border: "1px solid var(--grey80)",
            color: "var(--grey65)",
        },
        "&:focus-visible": {
            boxShadow: "0 0 0 3px var(--grey65)",
            outline: "none",
        },
        "&:not([disabled])": {
            cursor: "pointer",
            ...notDisabledStyle,
        },
        ...extraCss as Record<string, unknown>,
    };
};

export const buttonStyle = css;
