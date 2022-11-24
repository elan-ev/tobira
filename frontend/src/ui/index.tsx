import { Link } from "../router";
import { match } from "../util";
import { BREAKPOINT as NAV_BREAKPOINT } from "../layout/Navigation";
import { ReactNode } from "react";


export const SIDE_BOX_BORDER_RADIUS = 10;

export const SideBox: React.FC<{ children: ReactNode }> = ({ children }) => (
    <div css={{
        backgroundColor: "var(--grey95)",
        borderRadius: SIDE_BOX_BORDER_RADIUS,
        overflow: "hidden",
        "&:not(:first-child)": {
            marginTop: 32,
        },
    }}>{children}</div>
);

type LinkListProps = {
    items: JSX.Element[];
    className?: string;
};

/** A box with light grey background containing a list of items */
export const LinkList: React.FC<LinkListProps> = ({ items, ...rest }) => (
    <ul
        css={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            "& a": { ...FOCUS_STYLE_INSET },
            "& > li": {
                borderBottom: "2px solid white",
                "&:last-of-type": {
                    borderBottom: "none",
                },
                "& > *": {
                    padding: "6px 10px",
                    display: "flex",
                },
            },
            [`@media not all and (max-width: ${NAV_BREAKPOINT}px)`]: {
                "& > li:last-child > a": {
                    borderRadius: `0 0 ${SIDE_BOX_BORDER_RADIUS}px ${SIDE_BOX_BORDER_RADIUS}px`,
                },
                "&:first-child > li:first-child > a": {
                    borderRadius: `${SIDE_BOX_BORDER_RADIUS}px ${SIDE_BOX_BORDER_RADIUS}px 0 0`,
                },
            },
        }}
        {...rest}
    >
        {items.map((child, i) => <li key={i}>{child}</li>)}
    </ul>
);



type LinkWithIconProps = {
    to: string;
    iconPos: "left" | "right";
    active?: boolean;
    className?: string;
    children: ReactNode;
};

/** A link designed for `LinkList`. Has an icon on the left or right side. */
export const LinkWithIcon: React.FC<LinkWithIconProps> = ({
    to,
    iconPos,
    children,
    active = false,
    ...rest
}) => {
    const TRANSITION_DURATION = "0.1s";

    const hoverActiveStyle = {
        transitionDuration: "0s",
        backgroundColor: "var(--grey92)",
        "& > svg": {
            transitionDuration: "0s",
            color: "var(--grey40)",
        },
    };

    const style = {
        display: "flex",
        justifyContent: match(iconPos, {
            "left": () => "flex-start",
            "right": () => "space-between",
        }),
        alignItems: "center",
        transition: `background-color ${TRANSITION_DURATION}`,

        "& > svg": {
            fontSize: 22,
            minWidth: 22,
            color: "var(--grey65)",
            transition: `color ${TRANSITION_DURATION}`,
            ...match(iconPos, {
                "left": () => ({ marginRight: 12 } as Record<string, unknown>),
                "right": () => ({ marginLeft: 12 } as Record<string, unknown>),
            }),
        },

        "&:hover": hoverActiveStyle,
        ...active && {
            color: "var(--nav-color-darker)",
            "&": hoverActiveStyle,
        },
    };

    return active
        ? <span css={style} aria-current="page" {...rest}>{children}</span>
        : <Link to={to} css={style} {...rest}>{children}</Link>;
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

export const FOCUS_STYLE_INSET = {
    "&:focus-visible": {
        outline: "none",
        boxShadow: "inset 0 0 0 2px var(--accent-color)",
    },
} as const;

/** Returns CSS that makes text longer than `lines` lines to be truncated with `...`. */
export const ellipsisOverflowCss = (lines: number): Record<string, any> => ({
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: lines,
});
