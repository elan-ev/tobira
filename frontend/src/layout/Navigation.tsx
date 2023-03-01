import React, { ReactNode } from "react";
import { FiChevronRight, FiChevronLeft, FiCornerLeftUp } from "react-icons/fi";
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
                childOrder
                children { id name path }
                parent { isRoot name path }
            }
        `,
        fragRef,
    );

    const hasRealmParent = realm.parent !== null;

    // We expect all production instances to have more than the root realm. So
    // we print this information instead of an empty div to avoid confusion.
    if (realm.children.length === 0 && !hasRealmParent) {
        return <div css={{ margin: "8px 12px" }}>{t("general.no-root-children")}</div>;
    }

    const children = sortRealms(realm.children, realm.childOrder, i18n.language);

    return <nav>
        {hasRealmParent && <>
            <LinkWithIcon
                to={realm.parent.path}
                iconPos="left"
                css={{
                    color: "var(--grey40)",
                    padding: "10px 14px",
                    borderRadius: `${SIDE_BOX_BORDER_RADIUS}px ${SIDE_BOX_BORDER_RADIUS}px 0 0`,
                    ...focusStyle({ inset: true }),
                }}
            >
                {/* Show arrow and hide chevron in burger menu */}
                <FiCornerLeftUp css={{ display: "none" }}/>
                <FiChevronLeft />
                {realm.parent.isRoot ? t("home") : realm.parent.name ?? <MissingRealmName />}
            </LinkWithIcon>
            <div css={{
                padding: "8px 14px 8px 16px",
                color: "var(--nav-color-darker)",
                backgroundColor: "var(--grey86)",
                border: "2px solid white",
                borderLeft: "none",
                borderRight: "none",
            }}>{realm.name ?? <MissingRealmName />}</div>
        </>}
        <LinkList
            items={children.map(child => (
                <Item
                    key={child.id}
                    label={child.name ?? <MissingRealmName />}
                    link={child.path}
                />
            ))}
        />
    </nav>;
};

type ItemProps = {
    label: ReactNode;
    link: string;
};

const Item: React.FC<ItemProps> = ({ label, link }) => (
    <LinkWithIcon to={link} iconPos="right">
        <div css={ellipsisOverflowCss(3)}>{label}</div>
        <FiChevronRight />
    </LinkWithIcon>
);
