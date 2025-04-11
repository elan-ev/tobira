import { match, WithTooltip, screenWidthAbove, useColorScheme } from "@opencast/appkit";
import { LuAlertTriangle, LuInfo } from "react-icons/lu";
import { ReactNode } from "react";
import { CSSObject } from "@emotion/react";

import { Link } from "../router";
import { BREAKPOINT as NAV_BREAKPOINT } from "../layout/Navigation";
import { COLORS } from "../color";


export const SIDE_BOX_BORDER_RADIUS = 8;

export const SideBox: React.FC<{ children: ReactNode }> = ({ children }) => (
    <div css={{
        backgroundColor: COLORS.neutral10,
        borderRadius: SIDE_BOX_BORDER_RADIUS,
        overflow: "hidden",
        ":not(:first-child)": { marginTop: 26 },
        ...useColorScheme().scheme === "dark" && darkModeBoxShadow,
    }}>{children}</div>
);

type LinkListProps = {
    items: JSX.Element[];
    className?: string;
};

/** A box with light grey background containing a list of items */
export const LinkList: React.FC<LinkListProps> = ({ items, ...rest }) => {
    const itemStyle = {
        backgroundColor: COLORS.neutral10,
        borderBottom: `2px solid ${COLORS.neutral05}`,
        "&:last-of-type": { borderBottom: "none" },
        "& > a, & > span, & > form > button": {
            display: "flex",
            padding: "10px 16px",
        },
    };

    return <ul
        css={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            "& a, & form button": {
                ...focusStyle({ inset: true }),
                ...useColorScheme().scheme === "dark" && { color: COLORS.primary1 },
            },
            [screenWidthAbove(NAV_BREAKPOINT)]: {
                "& > li:last-child": {
                    "> a, > form button": {
                        borderRadius: `0 0 ${SIDE_BOX_BORDER_RADIUS}px ${SIDE_BOX_BORDER_RADIUS}px`,
                    },
                },
                "&:first-child > li:first-child > a": {
                    borderRadius: `${SIDE_BOX_BORDER_RADIUS}px ${SIDE_BOX_BORDER_RADIUS}px 0 0`,
                },
            },
        }}
        {...rest}
    >
        {items.map((child, i) => <li css={itemStyle} key={i}>{child}</li>)}
    </ul>;
};


export const linkWithIconStyle = (isDark: boolean, iconPos: "left" | "right", active?: boolean) => {
    const TRANSITION_DURATION = "0.1s";
    const hoverActiveStyle = {
        transitionDuration: "0s",
        backgroundColor: COLORS.neutral20,
        ...isDark && { color: COLORS.primary2 },
    };

    return {
        display: "flex",
        justifyContent: match(iconPos, {
            "left": () => "flex-start",
            "right": () => "space-between",
        }),
        textDecoration: "none",
        alignItems: "center",
        transition: `background-color ${TRANSITION_DURATION}`,
        "& > svg": {
            fontSize: 20,
            minWidth: 20,
            transition: `color ${TRANSITION_DURATION}`,
            ...match(iconPos, {
                "left": () => ({ marginRight: 12 } as Record<string, unknown>),
                "right": () => ({ marginLeft: 12 } as Record<string, unknown>),
            }),
        },

        "&:hover, &:focus-visible": hoverActiveStyle,
        ...active && {
            color: COLORS.primary2,
            "&": hoverActiveStyle,
        },
    };
};

type LinkWithIconProps = {
    to: string;
    iconPos: "left" | "right";
    active?: boolean;
    className?: string;
    children: ReactNode;
    close?: () => void;
};

/** A link designed for `LinkList`. Has an icon on the left or right side. */
export const LinkWithIcon: React.FC<LinkWithIconProps> = ({
    to,
    iconPos,
    children,
    active = false,
    close,
    ...rest
}) => {
    const isDark = useColorScheme().scheme === "dark";
    const style = linkWithIconStyle(isDark, iconPos, active);

    return active
        ? <span css={style} aria-current="page" {...rest}>{children}</span>
        : <Link to={to} css={style} onClick={close} {...rest}>{children}</Link>;
};

export const CenteredContent: React.FC<{ children: ReactNode }> = ({ children }) => (
    <div css={{ margin: "0 auto", maxWidth: 600 }}>{children}</div>
);

type TitleProps = {
    title: string;
    className?: string;
};

export const Title: React.FC<TitleProps> = ({ title, className }) => (
    <h2 className={className} css={{ margin: "16px 0" }}>{title}</h2>
);


/**
 * Applies focus outline with a default width of 2.5px to elements.
 * This should always be used instead of a custom focus property to ensure
 * consistency throughout the design.
 * If `({ inset: true })` is declared, the focus will be on the inside
 * of the focused element with a negative offset equal to the outline's width.
 * Otherwise is also possible to declare an additional offset (usually 1) for
 * elements with a similar color to the outline to make it stand out more.
 */
export const focusStyle = ({ width = 2.5, inset = false, offset = 0 }) => ({
    "&:focus-visible": {
        outline: `${width}px solid ${COLORS.focus}`,
        outlineOffset: `${inset ? -width : offset}px`,
    },
} as const);

/** Returns CSS that makes text longer than `lines` lines to be truncated with `...`. */
export const ellipsisOverflowCss = (lines: number): CSSObject => ({
    overflow: "hidden",
    textOverflow: "ellipsis",
    ...lines === 1
        ? {
            whiteSpace: "nowrap",
        }
        : {
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: lines,
        },
});

/** Box shadow used on multiple elements in dark mode */
export const darkModeBoxShadow = { boxShadow: "0 0 5px rgba(0, 0, 0, .2)" };

type InfoTooltipProps = {
    info: JSX.Element | string;
};

export const InfoTooltip: React.FC<InfoTooltipProps> = ({ info }) => (
    <WithTooltip
        tooltip={info}
        tooltipCss={{ width: "min(85vw, 460px)" }}
        css={{
            display: "inline-block",
            verticalAlign: "middle",
            fontWeight: "normal",
            marginLeft: 8,
        }}
    >
        <span><LuInfo tabIndex={0} /></span>
    </WithTooltip>
);

type IconWithTooltipProps = {
    tooltip: string;
    mode: "info" | "warning";
}

/** Info or warning icon with tooltip. */
export const IconWithTooltip: React.FC<IconWithTooltipProps> = ({ tooltip, mode }) => (
    <WithTooltip
        {...{ tooltip }}
        css={{ display: "flex", fontWeight: "normal" }}
        tooltipCss={{ width: "min(85vw, 460px)" }}
    >
        <span css={{ marginLeft: 6, display: "flex", alignItems: "center" }}>
            {mode === "info" ? <LuInfo /> : <LuAlertTriangle css={{ color: COLORS.danger0 }}/>}
        </span>
    </WithTooltip>
);

type NoteWithTooltipProps = {
    note: string;
    tooltip: string;
}

/** Similar to `IconWithTooltip`, but with a visible note. */
export const NoteWithTooltip: React.FC<NoteWithTooltipProps> = ({ note, tooltip }) => (
    <WithTooltip
        tooltip={tooltip}
        placement="bottom"
        tooltipCss={{ width: 400 }}
        css={{ display: "inline-block" }}
    >
        <div css={{
            fontSize: 14,
            lineHeight: 1,
            color: COLORS.neutral60,
            display: "flex",
            gap: 4,
            marginBottom: 16,
        }}>
            <LuInfo />
            {note}
        </div>
    </WithTooltip>
);
