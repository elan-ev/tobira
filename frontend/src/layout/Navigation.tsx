import React from "react";
import { FiChevronRight, FiChevronLeft } from "react-icons/fi";
import { graphql, useFragment } from "react-relay";

import type { NavigationData$key } from "../query-types/NavigationData.graphql";
import CONFIG from "../config";
import { prefersBlackText } from "../util/color";
import { useTranslation } from "react-i18next";
import { LinkList, LinkWithIcon } from "../ui";
import { match } from "../util";


/** The breakpoint, in pixels, where mobile/desktop navigations are swapped. */
export const BREAKPOINT = 880;


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

    return (
        <div>
            {realm.parent !== null && <>
                <LinkWithIcon
                    to={realm.parent.path === "" ? "/" : realm.parent.path}
                    iconPos="left"
                    css={{ padding: "6px 4px" }}
                >
                    <FiChevronLeft css={{ marginRight: "8px !important" }}/>
                    {realm.parent.isRoot ? t("home") : realm.parent.name}
                </LinkWithIcon>
                <div css={{
                    padding: 16,
                    paddingLeft: 4 + 22 + 8,
                    fontWeight: "bold",
                    backgroundColor: "var(--nav-color)",
                    color: prefersBlackText(CONFIG.theme.color.navigation) ? "black" : "white",
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
                    "& > li": {
                        borderBottom: "1px solid var(--grey80)",
                        "& > a": {
                            paddingRight: 6,
                            paddingLeft: realm.parent != null ? 4 + 22 + 8 : 16,
                        },
                    },
                }}
            />
        </div>
    );
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
