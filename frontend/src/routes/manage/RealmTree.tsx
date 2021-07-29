import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { graphql, useMutation, usePreloadedQuery } from "react-relay";
import type { PreloadedQuery } from "react-relay";

import { Root } from "../../layout/Root";
import type {
    RealmTreeManageQuery,
    RealmTreeManageQueryResponse,
} from "../../query-types/RealmTreeManageQuery.graphql";
import { loadQuery } from "../../relay";
import type { Route } from "../../router";
import { navData } from ".";
import { FiArrowDown, FiArrowUp } from "react-icons/fi";


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


type Props = {
    queryRef: null | PreloadedQuery<RealmTreeManageQuery>;
};

const ManageRealmTree: React.FC<Props> = ({ queryRef }) => {
    const { t } = useTranslation();

    const inner = queryRef == null ? <LandingPage /> : <Impl queryRef={queryRef} />;
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


const query = graphql`
    query RealmTreeManageQuery($path: String!) {
        realm: realmByPath(path: $path) {
            id
            name
            children { id name index }
        }
    }
`;

const mutation = graphql`
    mutation RealmTreeSaveChildOrderMutation($parent: ID!, $indices: [ChildIndex!]!) {
        setChildOrder(parent: $parent, childIndices: $indices) {
            children {
                id, name, index
            }
        }
    }
`;

type ImplProps = {
    queryRef: PreloadedQuery<RealmTreeManageQuery>;
};

type QueryResponse = Exclude<RealmTreeManageQueryResponse["realm"], null>;
type Child = QueryResponse["children"][0];

/** The actual implementation with a given realm path */
const Impl: React.FC<ImplProps> = ({ queryRef }) => {
    const { t } = useTranslation();
    const { realm } = usePreloadedQuery(query, queryRef);

    if (!realm) {
        // TODO: proper warning box and guidance
        return <p>Error: Path invalid</p>;
    }

    const heading = realm.name === ""
        ? t("manage.realm-tree.heading-root")
        : t("manage.realm-tree.heading", { realm: realm.name });

    const wasOrderedAlphabetically = realm.children.every(c => c.index === 0);
    const showOrderAlphabeticallyToggle = realm.children.length > 1;

    const [orderedAlphabetically, setOrderedAlphabetically] = useState(wasOrderedAlphabetically);
    const orderingDisabled = !showOrderAlphabeticallyToggle || orderedAlphabetically;

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

    const anyChange = wasOrderedAlphabetically !== orderedAlphabetically
        || children.some((c, i) => c.id !== realm.children[i].id);


    // TODO: show spinner while in flight.
    const [commit, _isInFlight] = useMutation(mutation);
    const save = async () => {
        commit({
            variables: {
                parent: realm.id,
                indices: children.map((c, i) => ({ id: c.id, index: i })),
            },
        });
    };

    return <>
        <h1>{heading}</h1>
        <div>
            {showOrderAlphabeticallyToggle && (
                <label>
                    <input
                        type="checkbox"
                        checked={orderedAlphabetically}
                        onChange={() => setOrderedAlphabetically(prev => !prev)}
                    />
                    {t("manage.realm-tree.sort-alphabetically")}
                </label>
            )}

            <ChildList disabled={orderingDisabled} swap={swap}>{
                // If "sort alphabetically" is enabled, we show sorted data.
                orderedAlphabetically
                    ? [...children].sort((a, b) => a.name.localeCompare(b.name))
                    : children
            }</ChildList>

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
