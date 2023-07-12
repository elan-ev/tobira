import { Interpolation, Theme } from "@emotion/react";
import React from "react";
import { focusStyle } from ".";
import { match } from "@opencast/appkit";

import { Link } from "../router";
import { COLORS } from "../color";



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

type LinkButtonProps = Omit<JSX.IntrinsicElements["a"], "ref"> & {
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

const css = (kind: Kind, extraCss: Interpolation<Theme> = {}): Interpolation<Theme> => {
    const notDisabledStyle = match(kind, {
        "normal": () => ({
            border: `1px solid ${COLORS.neutral40}`,
            color: COLORS.neutral90,
            "&:hover, &:focus-visible": {
                border: `1px solid ${COLORS.neutral60}`,
                backgroundColor: COLORS.neutral15,
            },
            ...focusStyle({ offset: -1 }),
        }),

        "danger": () => ({
            border: `1px solid ${COLORS.danger0}`,
            color: COLORS.danger0,
            "&:hover, &:focus-visible": {
                border: `1px solid ${COLORS.danger1}`,
                backgroundColor: COLORS.danger0,
                color: COLORS.danger0BwInverted,
            },
            ...focusStyle({ offset: 1 }),
        }),

        "happy": () => ({
            border: `1px solid ${COLORS.happy1}`,
            color: COLORS.happy0BwInverted,
            backgroundColor: COLORS.happy0,
            "&:hover, &:focus-visible": {
                border: `1px solid ${COLORS.happy2}`,
                backgroundColor: COLORS.happy1,
                color: COLORS.happy1BwInverted,
            },
            ...focusStyle({ offset: 1 }),
        }),
    });

    return {
        borderRadius: 8,
        display: "inline-flex",
        alignItems: "center",
        padding: "7px 14px",
        gap: 12,
        whiteSpace: "nowrap",
        backgroundColor: COLORS.neutral10,
        transition: "background-color 0.15s, border-color 0.15s",
        textDecoration: "none",
        "& > svg": {
            fontSize: 20,
        },
        "&:disabled": {
            border: `1px solid ${COLORS.neutral25}`,
            color: COLORS.neutral40,
        },
        "&:not([disabled])": {
            cursor: "pointer",
            ...notDisabledStyle,
        },
        ...extraCss as Record<string, unknown>,
    };
};

export const buttonStyle = css;
