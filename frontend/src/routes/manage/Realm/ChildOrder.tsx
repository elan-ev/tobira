import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { graphql, useFragment, useMutation } from "react-relay";

import { FiArrowDown, FiArrowUp } from "react-icons/fi";
import { match } from "../../../util";
import { bug } from "../../../util/err";
import { RealmOrder } from "../../../query-types/NavigationData.graphql";
import {
    ChildOrderEditData,
    ChildOrderEditData$key,
} from "../../../query-types/ChildOrderEditData.graphql";
import { Button } from "../../../ui/Button";
import { Spinner } from "../../../ui/Spinner";
import { boxError } from "../../../ui/error";
import { displayCommitError } from "./util";



const fragment = graphql`
    fragment ChildOrderEditData on Realm {
        id
        name
        childOrder
        children { id name index }
    }
`;



// We request the exact same data as in the query so that relay can update all
// internal data and everything is up to date.
const mutation = graphql`
    mutation ChildOrderMutation(
        $parent: ID!,
        $order: RealmOrder!,
        $indices: [ChildIndex!],
    ) {
        setChildOrder(parent: $parent, childOrder: $order, childIndices: $indices) {
            ... ChildOrderEditData
        }
    }
`;



type Child = ChildOrderEditData["children"][0];
type SortOrder = "by-index" | "alphabetical:asc" | "alphabetical:desc";

type Props = {
    fragRef: ChildOrderEditData$key;
};

/** The actual implementation with a given realm path */
export const ChildOrder: React.FC<Props> = ({ fragRef }) => {
    const { t, i18n } = useTranslation();
    const realm = useFragment(fragment, fragRef);

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

    const [commitError, setCommitError] = useState<JSX.Element | null>(null);
    const [commit, isInFlight] = useMutation(mutation);
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
            onError: e => {
                setCommitError(displayCommitError(e, t("manage.realm.children.failed")));
            },
        });
    };


    type SortOrderOptionProps = {
        label: string;
        order: SortOrder;
    };

    const SortOrderOption: React.FC<SortOrderOptionProps> = ({ label, order }) => (
        <div css={{ margin: 6 }}>
            <label>
                <input
                    type="radio"
                    checked={order === sortOrder}
                    onChange={() => setSortOrder(order)}
                    css={{ marginRight: 16 }}
                />
                {label}
            </label>
        </div>
    );

    const sortedChildren = match(sortOrder, {
        "alphabetical:asc": () =>
            [...children].sort((a, b) => a.name.localeCompare(b.name, i18n.language)),
        "alphabetical:desc": () =>
            [...children].sort((a, b) => b.name.localeCompare(a.name, i18n.language)),
        "by-index": () => children,
    });

    return <>
        <h2>{t("manage.realm.children.heading")}</h2>
        <div>
            <SortOrderOption
                label={t("manage.realm.children.sort-alphabetically-asc")}
                order="alphabetical:asc"
            />
            <SortOrderOption
                label={t("manage.realm.children.sort-alphabetically-desc")}
                order="alphabetical:desc"
            />
            <SortOrderOption
                label={t("manage.realm.children.order-manually") + ":"}
                order="by-index"
            />

            <ChildList disabled={sortOrder !== "by-index"} swap={swap}>
                {sortedChildren}
            </ChildList>

            <div css={{ display: "flex", alignItems: "center" }}>
                <Button onClick={save} disabled={!anyChange}>{t("save")}</Button>
                {isInFlight && <Spinner size={20} css={{ marginLeft: 16 }} />}
            </div>
            {boxError(commitError)}
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
