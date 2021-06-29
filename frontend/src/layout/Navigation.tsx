import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { graphql, usePreloadedQuery } from "react-relay";
import type { PreloadedQuery } from "react-relay";
import type { Interpolation, Theme } from "@emotion/react";

import { Link } from "../router";
import type { NavigationRootQuery } from "../query-types/NavigationRootQuery.graphql";


/**
 * Defines everything about the navigation that's either shown as box
 * (desktop) or as burger menu (mobile).
 */
export type Navigation = {
    items: NavItem[];

    /**
     * If the navigation is not currently showing the root realms, this is a
     * link to the parent realm
     */
    parentLink: string | null;
};

type NavItem = {
    /** Some unique ID. */
    id: string;

    /** What's shown to the user. */
    label: string;

    /** Absolute path, without domain. */
    link: string;

    /** Whether this item is currently the active route. */
    active: boolean;
};

/** The breakpoint, in pixels, where mobile/desktop navigations are swapped. */
export const BREAKPOINT = 850;


type DesktopProps = {
    nav: Navigation;
    layoutCss: Interpolation<Theme>;
};

export const DesktopNav: React.FC<DesktopProps> = ({ nav, layoutCss }) => (
    <ul css={{
        backgroundColor: "#F1F1F1",
        border: "1px solid #C5C5C5",
        borderRadius: 4,
        listStyle: "none",
        margin: 0,
        padding: 0,
        "& > li:last-of-type": {
            borderBottom: "none",
        },
        ...(layoutCss as Record<string, unknown>),
    }}>
        {nav.items.map(item => <Item key={item.id} item={item} />)}
    </ul>
);


type MobileProps = {
    /** Function that hides the burger menu. */
    hide: () => void;

    /** Actual navigation data */
    nav: Navigation;
};

export const MobileNav: React.FC<MobileProps> = ({ nav, hide }) => (
    <div
        onClick={hide}
        css={{
            position: "absolute",
            top: "var(--header-height)",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            backgroundColor: "#000000a0",
        }}
    >
        <div
            onClick={e => e.stopPropagation()}
            css={{
                position: "absolute",
                top: 0,
                right: 0,
                backgroundColor: "#F1F1F1",
                height: "100%",
                width: "clamp(260px, 75%, 450px)",
                overflowY: "auto",
            }}
        >
            {nav.parentLink !== null && (
                <Link
                    to={nav.parentLink}
                    css={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "2px 5px",
                        margin: 6,
                        border: "1px solid #C5C5C5",
                        borderRadius: 4,
                        ...ITEM_LINK_BASE_STYLE,
                    }}
                >
                    <FontAwesomeIcon icon={faChevronLeft} css={{ marginRight: 6 }}/>
                    Back
                </Link>
            )}
            <ul css={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                borderTop: "1px solid #ccc",
            }}>
                {nav.items.map(item => <Item key={item.id} item={item} />)}
            </ul>
        </div>
    </div>
);

const TRANSITION_DURATION = "0.1s";
const ITEM_LINK_BASE_STYLE = {
    textDecoration: "none",
    transition: `background-color ${TRANSITION_DURATION}`,

    "& > svg": {
        fontSize: 22,
        color: "#A9A9A9",
        transition: `color ${TRANSITION_DURATION}`,
    },

    "&:hover": {
        transitionDuration: "0.05s",
        backgroundColor: "#E2E2E2",
        "& > svg": {
            transitionDuration: "0.05s",
            color: "#6F6F6F",
        },
    },
};

const Item: React.FC<{ item: NavItem }> = ({ item }) => {
    const baseStyle = {
        padding: "6px 12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
    };

    const inner = item.active
        ? <b css={{ ...baseStyle, backgroundColor: "#C5C5C5" }}>
            {item.label}
        </b>
        : <Link
            to={item.link}
            css={{
                ...baseStyle,
                ...ITEM_LINK_BASE_STYLE,
            }}
        >
            <div>{item.label}</div>
            <FontAwesomeIcon icon={faChevronRight} />
        </Link>;

    return (
        <li css={{ borderBottom: "1px solid #C5C5C5" }}>
            {inner}
        </li>
    );
};

/**
 * Some routes don't need to fetch data themselves, but only for navigation.
 * This query can be used by those routes.
 */
export const ROOT_NAV_QUERY = graphql`
    query NavigationRootQuery {
        realm: rootRealm {
            children { id name path }
        }
    }
`;

/** Converts the query result in something that can be passed to `Root` as `nav` */
export const rootNavFromQuery = (query: PreloadedQuery<NavigationRootQuery>): Navigation => {
    const { realm } = usePreloadedQuery(ROOT_NAV_QUERY, query);
    return {
        parentLink: null,
        items: realm.children.map(({ id, path, name }) => ({
            id,
            label: name,
            link: `${path}`,
            active: false,
        })),
    };
};
