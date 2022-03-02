import React from "react";
import { FiChevronRight, FiChevronLeft } from "react-icons/fi";
import { graphql, useFragment } from "react-relay";

import type { NavigationData$key } from "./__generated__/NavigationData.graphql";
import { useTranslation } from "react-i18next";
import { FOCUS_STYLE_INSET, LinkList, LinkWithIcon } from "../ui";
import { match } from "../util";


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
                parent {
                    isRoot
                    name
                    path
                }
            }
        `,
        fragRef,
    );

    const children = [...realm.children];
    match(realm.childOrder, {
        "ALPHABETIC_ASC": () => {
            children.sort((a, b) => a.name.localeCompare(b.name, i18n.language));
        },
        "ALPHABETIC_DESC": () => {
            children.sort((a, b) => b.name.localeCompare(a.name, i18n.language));
        },
    }, () => {});

    return <nav>
        {realm.parent !== null && <>
            <LinkWithIcon
                to={realm.parent.path}
                iconPos="left"
                css={{
                    padding: "6px 4px",
                    ...FOCUS_STYLE_INSET,
                }}
            >
                <FiChevronLeft css={{ marginRight: "8px !important" }}/>
                {realm.parent.isRoot ? t("home") : realm.parent.name}
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
            }}>{realm.name}</div>
        </>}
        <LinkList
            items={children.map(child => (
                <Item
                    key={child.id}
                    label={child.name}
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
    label: string;
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
