import React from "react";
import { FiChevronRight, FiChevronLeft } from "react-icons/fi";
import { graphql, useFragment } from "react-relay";

import type { NavigationData$key } from "../query-types/NavigationData.graphql";
import CONFIG from "../config";
import { prefersBlackText } from "../util/color";
import { useTranslation } from "react-i18next";
import { LinkList, LinkWithIcon } from "../ui";


/**
 * Source of navigation data: either it's stored directly or will be retrieved
 * via query.
 */
export type NavSource = {
    kind: "static";
    data: Navigation;
} | {
    kind: "query";
    fragRef: NavigationData$key;
};

export const navFromQuery = (fragRef: NavigationData$key): NavSource => (
    { kind: "query", fragRef }
);


/**
 * Defines everything about the navigation that's either shown as box
 * (desktop) or as burger menu (mobile).
 */
export type Navigation = {
    items: NavItem[];
    currentName: string | null;
    parent: null | {
        name: string;
        link: string;
    };
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



// ===== Helper machinery to be able to work with both kinds of navigation sources ===============

/** Prop type directly containing navigation data */
type NavDataProp = {
    nav: Navigation;
};

/** Prop type containing a source for navigation data */
type NavSourceProp = {
    source: NavSource;
};

/** Props defining a nested component and its props */
type ForwardProps<InnerProps> = {
    Component: React.ComponentType<InnerProps & NavDataProp>;
    innerProps: InnerProps;
};

/**
 * Component taking a navigation data source and an inner component. Renders the
 * inner component with the resolved navigation data (either directly or by
 * extracting from the given query).
 */
function Dispatch<InnerProps>(
    { source, Component, innerProps }: ForwardProps<InnerProps> & NavSourceProp,
) {
    if (source.kind === "static") {
        return React.createElement(Component, { nav: source.data, ...innerProps });
    } else {
        return <ViaQuery fragRef={source.fragRef} Component={Component} innerProps={innerProps} />;
    }
}

type ViaQueryProps<InnerProps> = ForwardProps<InnerProps> & {
    fragRef: NavigationData$key;
};

/**
 * Takes a fragRef, extracts navigation data from it and renders inner
 * component with said data.
 */
function ViaQuery<InnerProps>({ fragRef, Component, innerProps }: ViaQueryProps<InnerProps>) {
    const { t } = useTranslation();
    const realm = useFragment(
        graphql`
            fragment NavigationData on Realm {
                id
                name
                children { id name path }
                parent {
                    isRoot
                    name
                    path
                    children { id name path }
                }
            }
        `,
        fragRef,
    );

    const items = realm.children.length > 0
        ? realm.children.map(({ id, path, name }) => ({
            id,
            label: name,
            link: `${path}`,
            active: false,
        }))
        : (realm.parent?.children ?? []).map(({ id, name, path }) => ({
            id,
            label: name,
            link: `${path}`,
            active: id === realm.id,
        }));

    const nav = {
        items,
        currentName: realm.name,
        parent: realm.parent && {
            name: realm.parent.isRoot ? t("home") : realm.parent.name,
            link: realm.parent.path === "" ? "/" : `${realm.parent.path}`,
        },
    };

    return React.createElement(Component, { nav, ...innerProps });
}



// ===== Desktop Navigation ======================================================================

export const DesktopNav: React.FC<NavSourceProp> = ({ source, ...innerProps }) => (
    <Dispatch source={source} Component={DesktopNavImpl} innerProps={innerProps} />
);

const DesktopNavImpl: React.FC<NavDataProp> = ({ nav }) => (
    <LinkList items={nav.items.map(item => <Item key={item.id} item={item} />)} />
);



// ===== Mobile Navigation =======================================================================

export const MobileNav: React.FC<NavSourceProp> = ({ source, ...innerProps }) => (
    <Dispatch source={source} Component={MobileNavImpl} innerProps={innerProps} />
);

const MobileNavImpl: React.FC<NavDataProp> = ({ nav }) => (
    <div>
        {nav.parent !== null && <>
            <LinkWithIcon to={nav.parent.link} iconPos="left" css={{ padding: "6px 12px" }}>
                <FiChevronLeft css={{ marginRight: 6 }}/>
                {nav.parent.name}
            </LinkWithIcon>
            <div css={{
                padding: 16,
                paddingLeft: 12 + 22 + 12,
                fontSize: 18,
                fontWeight: "bold",
                backgroundColor: "var(--accent-color)",
                ...prefersBlackText(CONFIG.theme.color.accent)
                    ? { color: "black", textShadow: "1px 1px 0 white" }
                    : { color: "white", textShadow: "1px 1px 0 black" },
            }}>{nav.currentName}</div>
        </>}
        <LinkList
            items={nav.items.map(item => <Item key={item.id} item={item} />)}
            css={{
                borderBottom: "1px solid var(--grey80)",
                ...nav.parent === null && { borderTop: "1px solid var(--grey80)" },
                "& > li": {
                    borderBottom: "1px solid var(--grey80)",
                    "& > a, & > b": {
                        display: "flex",
                        alignItems: "center",
                        padding: "6px 12px",
                        paddingLeft: 12 + 22 + 12,
                    },
                },
            }}
        />
    </div>
);

const Item: React.FC<{ item: NavItem }> = ({ item }) => {
    if (item.active) {
        return (
            <b css={{ backgroundColor: "var(--grey92)", borderLeft: "4px solid var(--grey80)" }}>
                {item.label}
            </b>
        );
    } else {
        return (
            <LinkWithIcon to={item.link} iconPos="right">
                <div>{item.label}</div>
                <FiChevronRight />
            </LinkWithIcon>
        );
    }
};

/**
 * Some routes don't need to fetch data themselves, but only for navigation.
 * This query can be used by those routes.
 */
export const ROOT_NAV_QUERY = graphql`
    query NavigationRootQuery {
        realm: rootRealm {
            ... NavigationData
        }
    }
`;
