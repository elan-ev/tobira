import React, { ReactNode } from "react";
import { FiChevronRight, FiChevronLeft } from "react-icons/fi";
import { graphql, useFragment } from "react-relay";

import type { NavigationData$key } from "./__generated__/NavigationData.graphql";
import { useTranslation } from "react-i18next";
import { FOCUS_STYLE_INSET, LinkList, LinkWithIcon, SIDE_BOX_BORDER_RADIUS } from "../ui";
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

    // We expect all production instances to have more than the root realm. So
    // we print this information instead of an empty div to avoid confusion.
    if (realm.children.length === 0 && realm.parent === null) {
        return <div css={{ margin: "8px 12px" }}>{t("general.no-root-children")}</div>;
    }

    const children = sortRealms(realm.children, realm.childOrder, i18n.language);

    return <nav>
        {realm.parent !== null && <>
            <LinkWithIcon
                to={realm.parent.path}
                iconPos="left"
                css={{
                    padding: "6px 4px",
                    [`@media not all and (max-width: ${BREAKPOINT}px)`]: {
                        borderRadius: `${SIDE_BOX_BORDER_RADIUS}px ${SIDE_BOX_BORDER_RADIUS}px 0 0`,
                    },
                    ...FOCUS_STYLE_INSET,
                }}
            >
                <FiChevronLeft css={{ marginRight: "8px !important" }}/>
                {realm.parent.isRoot ? t("home") : realm.parent.name ?? <MissingRealmName />}
            </LinkWithIcon>
            <div css={{
                padding: 12,
                paddingLeft: 4 + 22 + 8,
                fontWeight: "bold",
                backgroundColor: "var(--nav-color-dark)",
                color: "var(--nav-color-bw-contrast)",
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
            css={{
                "& > li > ": {
                    paddingRight: 6,
                    paddingLeft: realm.parent != null ? 4 + 22 + 8 : 16,
                },
            }}
        />
    </nav>;
};

type ItemProps = {
    label: ReactNode;
    link: string;
};

const Item: React.FC<ItemProps> = ({ label, link }) => (
    <LinkWithIcon to={link} iconPos="right">
        <div css={{
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 3,
            textOverflow: "ellipsis",
            overflow: "hidden",
        }}>{label}</div>
        <FiChevronRight />
    </LinkWithIcon>
);
