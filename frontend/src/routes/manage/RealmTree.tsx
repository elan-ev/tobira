import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { graphql, useFragment, useMutation, usePreloadedQuery } from "react-relay";
import type { PreloadedQuery } from "react-relay";

import { Root } from "../../layout/Root";
import type { RealmTreeManageQuery } from "../../query-types/RealmTreeManageQuery.graphql";
import { loadQuery } from "../../relay";
import type { Route } from "../../router";
import { navData } from ".";
import { FiArrowDown, FiArrowUp } from "react-icons/fi";
import { match } from "../../util";
import { bug } from "../../util/err";
import { RealmOrder } from "../../query-types/NavigationData.graphql";
import {
    RealmTreeOrderEditData,
    RealmTreeOrderEditData$key,
} from "../../query-types/RealmTreeOrderEditData.graphql";


export const PATH = "/~manage/realm-tree";

export const ManageRealmTreeRoute: Route<Props> = {
    path: "/~manage/realm-tree",
    prepare: (_, getParams) => {
        const path = getParams.get("path");
        return {
            queryRef: path == null ? null : loadQuery(query, { path }),
        };
    },
    render: props => <ManageRealmTree {...props} />,
};


// ===============================================================================================
// ===== Just some plumbing/forwarding code ======================================================
// ===============================================================================================

type Props = {
    queryRef: null | PreloadedQuery<RealmTreeManageQuery>;
};

/**
 * Entry point: checks if a path is given. If so forwards to `CheckRealmExists`,
 * otherwise shows a landing page.
 */
const ManageRealmTree: React.FC<Props> = ({ queryRef }) => {
    const { t } = useTranslation();

    const inner = queryRef == null ? <LandingPage /> : <CheckRealmExists queryRef={queryRef} />;
    return <Root navSource={navData(t, PATH)}>{inner}</Root>;
};

/** If no realm path is given, we just tell the user how to get going */
const LandingPage: React.FC = () => {
    const { t } = useTranslation();

    return <>
        <h1>{t("manage.realm-tree.title")}</h1>

        <p css={{ maxWidth: 600 }}>{t("manage.realm-tree.landing-text")}</p>
    </>;
};

type CheckRealmExistsProps = {
    queryRef: PreloadedQuery<RealmTreeManageQuery>;
};

/**
 * Just checks if the realm path points to a realm. If so, forwards to `Impl`;
 * `PathInvalid` otherwise.
 */
const CheckRealmExists: React.FC<CheckRealmExistsProps> = ({ queryRef }) => {
    const { realm } = usePreloadedQuery(query, queryRef);
    return !realm
        ? <PathInvalid />
        : <Impl fragRef={realm} />;
};

// TODO: improve
const PathInvalid: React.FC = () => <p>Error: Path invalid</p>;


// ===============================================================================================
// ===== GraphQL query and mutation ==============================================================
// ===============================================================================================

const fragment = graphql`
    fragment RealmTreeOrderEditData on Realm {
        id
        name
        childOrder
        children { id name index }
    }
`;

const query = graphql`
    query RealmTreeManageQuery($path: String!) {
        realm: realmByPath(path: $path) {
            ... RealmTreeOrderEditData
        }
    }
`;

// We request the exact same data as in the query so that relay can update all
// internal data and everything is up to date.
const mutation = graphql`
    mutation RealmTreeSaveChildOrderMutation(
        $parent: ID!,
        $order: RealmOrder!,
        $indices: [ChildIndex!],
    ) {
        setChildOrder(parent: $parent, childOrder: $order, childIndices: $indices) {
            ... RealmTreeOrderEditData
        }
    }
`;


// ===============================================================================================
// ===== Actual implementation ===================================================================
// ===============================================================================================

type Child = RealmTreeOrderEditData["children"][0];
type SortOrder = "by-index" | "alphabetical:asc" | "alphabetical:desc";

type ImplProps = {
    fragRef: RealmTreeOrderEditData$key;
};

/** The actual implementation with a given realm path */
const Impl: React.FC<ImplProps> = ({ fragRef }) => {
    const { t, i18n } = useTranslation();
    const realm = useFragment(fragment, fragRef);

    const heading = realm.name === ""
        ? t("manage.realm-tree.heading-root")
        : t("manage.realm-tree.heading", { realm: realm.name });

    const intialSortOrder = match<RealmOrder, SortOrder>(realm.childOrder, {
        "ALPHABETIC_ASC": () => "alphabetical:asc",
        "ALPHABETIC_DESC": () => "alphabetical:desc",
        "BY_INDEX": () => "by-index",

        // This is not optimal. The only useful thing we could do in the future
        // is to disable the whole form just to be save, whenever we encounter
        // a sort order we don't know.
        "%future added value": () => bug("unknown realm sort order"),
    });
    const [sortOrder, setSortOrder] = useState<SortOrder>(intialSortOrder);
    const [children, setChildren] = useState(realm.children);

    // Swaps `index` with `index + 1`.
    const swap = (index: number) => {
        setChildren([
            ...children.slice(0, index),
            children[index + 1],
            children[index],
            ...children.slice(index + 2),
        ]);
    };

    // Check if anything has changed
    const anyChange = intialSortOrder !== sortOrder
        || children.some((c, i) => c.id !== realm.children[i].id);


    // TODO: show spinner while in flight.
    const [commit, _isInFlight] = useMutation(mutation);
    const save = async () => {
        commit({
            variables: {
                parent: realm.id,
                order: match(sortOrder, {
                    "alphabetical:asc": () => "ALPHABETIC_ASC",
                    "alphabetical:desc": () => "ALPHABETIC_DESC",
                    "by-index": () => "BY_INDEX",
                }),
                indices: sortOrder === "by-index"
                    ? children.map((c, i) => ({ id: c.id, index: i }))
                    : null,
            },
        });
    };


    type SortOrderOptionProps = {
        label: string;
        order: SortOrder;
    };

    const SortOrderOption: React.FC<SortOrderOptionProps> = ({ label, order }) => (
        <label css={{ display: "block", margin: 6 }}>
            <input
                type="radio"
                checked={order === sortOrder}
                onChange={() => setSortOrder(order)}
                css={{ marginRight: 16 }}
            />
            {label}
        </label>
    );

    const sortedChildren = match(sortOrder, {
        "alphabetical:asc": () =>
            [...children].sort((a, b) => a.name.localeCompare(b.name, i18n.language)),
        "alphabetical:desc": () =>
            [...children].sort((a, b) => b.name.localeCompare(a.name, i18n.language)),
        "by-index": () => children,
    });

    return <>
        <h1>{heading}</h1>
        <div>
            <SortOrderOption
                label={t("manage.realm-tree.sort-alphabetically-asc")}
                order="alphabetical:asc"
            />
            <SortOrderOption
                label={t("manage.realm-tree.sort-alphabetically-desc")}
                order="alphabetical:desc"
            />
            <SortOrderOption
                label={t("manage.realm-tree.order-manually") + ":"}
                order="by-index"
            />

            <ChildList disabled={sortOrder !== "by-index"} swap={swap}>
                {sortedChildren}
            </ChildList>

            <button onClick={save} disabled={!anyChange}>{t("save")}</button>
        </div>
    </>;
};


type ChildListProps = {
    children: readonly Child[];
    swap: (index: number) => void;
    disabled: boolean;
};

const ChildList: React.FC<ChildListProps> = ({ disabled, children, swap }) => {
    const { t } = useTranslation();

    return (
        <ol css={{
            marginLeft: 32,
            maxWidth: 900,
            padding: 0,
            ...disabled && {
                pointerEvents: "none",
                opacity: 0.5,
            },
        }}>
            {children.map((child, i) => (
                <li key={child.id} css={{
                    display: "flex",
                    alignItems: "center",
                    border: "1px solid var(--grey80)",
                    margin: 4,
                    borderRadius: 4,
                    overflow: "hidden",
                }}>
                    <div css={{
                        display: "flex",
                        flexDirection: "column",
                        marginRight: 16,
                        fontSize: 20,
                        "& > button": {
                            border: "none",
                            display: "flex",
                            alignItems: "center",
                            borderRight: "1px solid var(--grey80)",
                            padding: "4px 16px",
                            backgroundColor: "inherit",
                            "&:disabled": {
                                color: "transparent",
                            },
                            "&:not([disabled])": {
                                cursor: "pointer",
                                "&:hover": {
                                    backgroundColor: "var(--grey97)",
                                    color: "var(--accent-color)",
                                },
                            },
                            "&:first-child": {
                                borderBottom: "1px solid var(--grey80)",
                            },
                        },
                    }}>
                        <button
                            onClick={() => swap(i - 1)}
                            title={t("direction-up")}
                            disabled={i === 0}
                        ><FiArrowUp /></button>
                        <button
                            onClick={() => swap(i)}
                            title={t("direction-down")}
                            disabled={i === children.length - 1}
                        ><FiArrowDown /></button>
                    </div>
                    <div css={{ padding: 4 }}>{child.name}</div>
                </li>
            ))}
        </ol>
    );
};
