import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight } from "@fortawesome/free-solid-svg-icons";

import { Link } from "../router";


type Props = {
    title?: string;
    breadcrumbs?: React.ReactNode;
} & NavProps;

type NavItem = {
    id: string;
    label: string;
    link: string;

    // If `leafNode` is set to true, one nav item has to have `active` set to
    // true, too.
    active: boolean;
};

/**
 * At this screen width, the layout changes from a sidebar for navigation (for
 * larger screens) and the navigation inlined (for smaller screens).
 */
const BREAKPOINT = 720;

/**
 * A layout for the `<main>` part of pages that require a navigation (mainly
 * realms). The navigation is either shown on the left as a sidebar (for large
 * screens) or inline below the page title (for small screens).
 */
export const NavMain: React.FC<Props> = ({ title, breadcrumbs, children, ...navProps }) => (
    <div css={{
        [`@media (min-width: ${BREAKPOINT}px)`]: {
            display: "grid",
            columnGap: 32,
            // The `minmax(0, 1fr)` instead of `1fr` is necessary to give that
            // column a definite minumum size of 0 as otherwise it would
            // overflow when large.
            grid: `
                "nav  breadcrumbs" auto
                "nav  title"       auto
                "nav  main"        1fr
                / fit-content(27%) minmax(0, 1fr)
            `,
        },
    }}>
        <div css={{ gridArea: "breadcrumbs" }}>{breadcrumbs}</div>
        {title !== undefined && <h1 css={{ gridArea: "title", margin: "12px 0" }}>{title}</h1>}
        <NavBox><Nav {...navProps} /></NavBox>
        <div css={{ gridArea: "main" }}>{children}</div>
    </div>
);

type NavProps = {
    items: NavItem[];

    // Is this node a leaf node (i.e. does not have any children)? If so, the
    // navigation items are expected to be the siblings of the current node
    // instead of the children. Futhermore, the navigation is only shown for
    // wide screens.
    leafNode: boolean;
};

export const Nav: React.FC<NavProps> = ({ items }) => (
    <ul css={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        borderTop: "1px solid #ccc",
    }}>
        {items.map(item => {
            const TRANSITION_DURATION = "0.1s";
            const baseStyle = {
                padding: "6px 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
            };

            const inner = item.active
                ? <b css={{ ...baseStyle, backgroundColor: "#ddd" }}>
                    {item.label}
                </b>
                : <Link
                    to={item.link}
                    css={{
                        ...baseStyle,
                        textDecoration: "none",
                        transition: `background-color ${TRANSITION_DURATION}`,

                        "& > svg": {
                            fontSize: 22,
                            color: "#bbb",
                            transition: `color ${TRANSITION_DURATION}`,
                        },

                        "&:hover": {
                            transitionDuration: "0.05s",
                            backgroundColor: "#eee",
                            textDecoration: "underline",
                            "& > svg": {
                                transitionDuration: "0.05s",
                                color: "#888",
                            },
                        },
                    }}
                >
                    <div>{item.label}</div>
                    <FontAwesomeIcon icon={faChevronRight} />
                </Link>;

            return (
                <li key={item.id} css={{ borderBottom: "1px solid #ccc" }}>
                    {inner}
                </li>
            );
        })}
    </ul>
);

/** The navigation part of the layout. */
const NavBox: React.FC = ({ children }) => (
    <nav css={{
        gridArea: "nav",

        // This is necessary for the `fit-content` column width to correctly
        // apply.
        overflow: "hidden",

        [`@media not all and (min-width: ${BREAKPOINT}px)`]: {
            display: "none",
        },
    }}>
        <div css={{
            // This is required to make the parent `div` (a grid item)
            // span up to 300px wide. This is basically the only way to
            // get this grid item span a percentage with a maximum
            // width.
            minWidth: 300,
        }} />
        {children}
    </nav>
);
