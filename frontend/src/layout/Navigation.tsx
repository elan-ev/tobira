import React, { ReactNode } from "react";
import { LuChevronLeft, LuChevronRight, LuCornerLeftUp } from "react-icons/lu";
import { graphql, useFragment } from "react-relay";

import type { NavigationData$key } from "./__generated__/NavigationData.graphql";
import { useTranslation } from "react-i18next";
import {
    ellipsisOverflowCss,
    focusStyle,
    LinkList,
    LinkWithIcon,
    SIDE_BOX_BORDER_RADIUS,
} from "../ui";
import { MissingRealmName, sortRealms } from "../routes/util";
import { COLORS } from "../color";


/** The breakpoint, in pixels, where mobile/desktop navigations are swapped. */
export const BREAKPOINT = 880;

export type NavItems = [] | JSX.Element | [JSX.Element, JSX.Element];

type Props = {
    fragRef: NavigationData$key;
};

/**
 * Navigation for realm pages. Shows all children of the current realm, as well
 * as the current realm name and a button to the parent. The `fragRef` is a
 * reference to a realm that has the data of the `NavigationData` fragment in
 * it.
 */
export const Nav: React.FC<Props> = ({ fragRef }) => {
    const { t, i18n } = useTranslation();
    const realm = useFragment(
        graphql`
            fragment NavigationData on Realm {
                id
                name
                path
                nav {
                    up { name path }
                    showSelf
                    list { name path }
                    listOrder
                }
            }
        `,
        fragRef,
    );
    const nav = realm.nav;

    // We expect all production instances to have more than the root realm. So
    // we print this information instead of an empty div to avoid confusion.
    if (nav.list.length === 0 && !nav.up) {
        return <div css={{ margin: "8px 12px" }}>{t("general.no-root-children")}</div>;
    }

    const list = sortRealms(nav.list, nav.listOrder, i18n.language);

    return <nav>
        {nav.up && <>
            <LinkWithIcon
                to={nav.up.path || "/"} // Single slash for root realm
                iconPos="left"
                css={{
                    color: COLORS.neutral60,
                    padding: "10px 14px",
                    borderRadius: `${SIDE_BOX_BORDER_RADIUS}px ${SIDE_BOX_BORDER_RADIUS}px 0 0`,
                    ...nav.showSelf ? {} : { borderBottom: `2px solid ${COLORS.neutral05}` },
                    ...focusStyle({ inset: true }),
                }}
            >
                {/* Show arrow and hide chevron in burger menu */}
                <LuCornerLeftUp css={{ display: "none" }}/>
                <LuChevronLeft />
                {nav.up.path === "" ? t("general.home") : nav.up.name ?? <MissingRealmName />}
            </LinkWithIcon>
            {nav.showSelf && <div css={{
                padding: nav.showSelf ? "8px 14px 8px 16px" : 2,
                color: COLORS.primary2,
                backgroundColor: COLORS.neutral20,
                border: `2px solid ${COLORS.neutral05}`,
                borderLeft: "none",
                borderRight: "none",
            }}>{nav.showSelf ? realm.name ?? <MissingRealmName /> : null}</div>}
        </>}
        <LinkList
            items={list.map(item => (
                <Item
                    key={item.path}
                    label={item.name ?? <MissingRealmName />}
                    link={item.path}
                    isActive={item.path === realm.path}
                    indent={nav.showSelf && !!nav.up}
                />
            ))}
        />
    </nav>;
};

type ItemProps = {
    label: ReactNode;
    link: string;
    isActive: boolean;
    indent: boolean;
};

const Item: React.FC<ItemProps> = ({ label, link, isActive, indent }) => isActive
    ? <span css={{
        backgroundColor: COLORS.neutral20,
        fontWeight: "bold",
    }}>{label}</span>
    : <LinkWithIcon to={link} iconPos="right">
        <div css={{
            ...indent && { paddingLeft: 16 },
            ...ellipsisOverflowCss(3),
        }}>{label}</div>
        <LuChevronRight />
    </LinkWithIcon>;
