import React, { ReactNode } from "react";
import { LuChevronRight, LuEyeOff, LuOctagonMinus } from "react-icons/lu";
import { graphql, useFragment } from "react-relay";

import type { NavigationData$key } from "./__generated__/NavigationData.graphql";
import { useTranslation } from "react-i18next";
import {
    ellipsisOverflowCss,
    focusStyle,
    SIDE_BOX_BORDER_RADIUS,
} from "../ui";
import { MissingRealmName, sortRealms } from "../routes/util";
import { COLORS } from "../color";
import { Link } from "../router";
import { screenWidthAbove, useColorScheme } from "@opencast/appkit";
import { css } from "@emotion/react";
import { useMenu } from "./MenuState";


/** The breakpoint, in pixels, where mobile/desktop navigations are swapped. */
export const BREAKPOINT = 880;

export type NavItems = [] | JSX.Element | [JSX.Element, JSX.Element];

type Props = {
    fragRef: NavigationData$key;
};

/**
 * Navigation for realm pages. The `fragRef` is a reference to a realm that has
 * the data of the `NavigationData` fragment in it.
 */
export const RealmNav: React.FC<Props> = ({ fragRef }) => {
    const { t, i18n } = useTranslation();
    const realm = useFragment(
        graphql`
            fragment NavigationData on Realm {
                id
                name
                path
                nav {
                    header { name path visible }
                    list { name path hasChildren visible showInMenu }
                    listOrder
                }
            }
        `,
        fragRef,
    );
    const nav = { ...realm.nav };

    // We expect all production instances to have more than the root realm. So
    // we print this information instead of an empty div to avoid confusion.
    if (nav.list.length === 0 && nav.header.length === 0) {
        return <Nav items={[{
            label: t("general.no-root-children"),
            active: true,
            indent: 0,
            link: "/",
        }]} />;
    }

    const shared = (item: { path: string, name?: string | null }) => ({
        label: item.path === "" ? t("general.home") : item.name ?? <MissingRealmName />,
        active: item.path === realm.path,
        link: item.path || "/",
    });

    const hiddenIcon = <span css={{ display: "flex" }} title={t("realm.hidden-tooltip")}>
        <LuOctagonMinus />
    </span>;
    const hiddenFromMenuIcon = (
        <span css={{ display: "flex" }} title={t("realm.hidden-from-menu-tooltip")}>
            <LuEyeOff />
        </span>
    );

    return <Nav items={[
        // Header
        ...nav.header.map((item, i) => ({
            ...shared(item),
            indent: i,
            stateIcon: !item.visible && hiddenIcon,
        } satisfies NavItem)),

        // Main list
        ...sortRealms(nav.list, nav.listOrder, i18n.language).map(item => ({
            ...shared(item),
            indent: nav.header.length,
            stateIcon: !item.visible
                ? hiddenIcon
                : !item.showInMenu && hiddenFromMenuIcon,
            icon: item.hasChildren ? {
                icon: <LuChevronRight />,
                position: "right",
            } : undefined,
        } satisfies NavItem)),
    ]} />;
};


type NavItem = {
    label: ReactNode;
    /** Indentation level, small positive integer */
    indent: number;
    active: boolean;
    link: string;
    icon?: {
        position: "left" | "right";
        icon: ReactNode;
    };
    stateIcon?: ReactNode;
    closeBurgerOnClick?: boolean;
};

type NavProps = {
    items: NavItem[];
};

/**
 * TODO: docs
 */
export const Nav: React.FC<NavProps> = ({ items }) => {
    const { isDark } = useColorScheme();

    const menu = useMenu();
    const closeBurger = () => menu.state === "burger" && menu.close();

    return <nav>
        <ul css={{
            listStyle: "none",
            margin: 0,
            padding: 0,
        }}>
            {items.map((item, i) => (
                <li key={i} css={{
                    backgroundColor: COLORS.neutral10, // For burger menu
                    borderBottom: `2px solid ${COLORS.neutral05}`,
                    "&:last-of-type": { borderBottom: "none" },
                    [screenWidthAbove(BREAKPOINT)]: {
                        "&:first-child > *": {
                            borderTopRightRadius: SIDE_BOX_BORDER_RADIUS,
                            borderTopLeftRadius: SIDE_BOX_BORDER_RADIUS,
                        },
                        "&:last-child > *": {
                            borderBottomRightRadius: SIDE_BOX_BORDER_RADIUS,
                            borderBottomLeftRadius: SIDE_BOX_BORDER_RADIUS,
                        },
                    },
                }}>
                    <NavItem
                        {...{ item }}
                        isDarkMode={isDark}
                        onLinkClick={item.closeBurgerOnClick ? closeBurger : undefined}
                    />
                </li>
            ))}
        </ul>
    </nav>;
};

type NavItemProps = {
    item: NavItem,
    isDarkMode: boolean;
    onLinkClick?: () => void;
};

const NavItem: React.FC<NavItemProps> = ({ item, isDarkMode, onLinkClick }) => {
    // Shared style (for active & links)
    const style = css({
        display: "block",
        padding: 10,
        paddingRight: 12,
        paddingLeft: 16 + item.indent * 16,
        "& > svg": {
            fontSize: 20,
            minWidth: 20,
        },
    });

    const inner = <div css={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 12,
    }}>
        {item.icon && item.icon.position === "left" && item.icon.icon}
        {item.stateIcon}
        <span css={ellipsisOverflowCss(2)}>{item.label}</span>
        {item.icon && item.icon.position === "right" && (
            <span css={{ display: "flex", marginLeft: "auto" }}>{item.icon.icon}</span>
        )}
    </div>;

    if (item.active) {
        const activeStyle = css({
            fontWeight: "bold",
            position: "relative" as const,
            backgroundColor: COLORS.neutral15,
        });

        return <div css={[style, activeStyle]} aria-current="page">
            <div css={{
                position: "absolute",
                right: 0,
                top: 0,
                bottom: 0,
                width: 3,
                backgroundColor: COLORS.neutral40,
            }} />
            {inner}
        </div>;
    } else {
        const linkStyle = css({
            textDecoration: "none",
            transitionProperty: "background-color, color",
            transitionDuration: "0.15s",
            "&:hover, &:focus-visible": {
                transitionDuration: "0s", // Make on hover immediate, on blur transition
                backgroundColor: COLORS.neutral20,
                ...isDarkMode && { color: COLORS.primary2 },
            },
            ...isDarkMode && { color: COLORS.primary1 },
            ...focusStyle({ inset: true }),
        });

        return <Link
            to={item.link}
            onClick={onLinkClick}
            css={[style, linkStyle]}
        >{inner}</Link>;
    }
};
