import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { graphql, usePreloadedQuery } from "react-relay";
import type { PreloadedQuery } from "react-relay";

import { Link } from "../router";
import type { NavigationRootQuery } from "../query-types/NavigationRootQuery.graphql";


/**
 * Defines everything about the navigation that's either shown as box
 * (desktop) or as burger menu (mobile).
 */
export type Navigation = {
    items: NavItem[];
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
            <Nav nav={nav} />
        </div>
    </div>
);


type NavProps = {
    nav: Navigation;
};

export const Nav: React.FC<NavProps> = ({ nav }) => (
    <ul css={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        borderTop: "1px solid #ccc",
    }}>
        {nav.items.map(item => {
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
        items: realm.children.map(({ id, path, name }) => ({
            id,
            label: name,
            link: `/r${path}`,
            active: false,
        })),
    };
};
