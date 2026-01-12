import React, { JSX, useState } from "react";
import { useTranslation } from "react-i18next";
import { graphql, useFragment, useMutation } from "react-relay";
import { bug, unreachable, useColorScheme, WithTooltip } from "@opencast/appkit";

import { LuArrowUp, LuArrowDown } from "react-icons/lu";
import { RealmOrder } from "../../../layout/__generated__/NavigationData.graphql";
import {
    ChildOrderEditData$data,
    ChildOrderEditData$key,
} from "./__generated__/ChildOrderEditData.graphql";
import { Button, Spinner, boxError } from "@opencast/appkit";
import { displayCommitError } from "./util";
import { sortRealms } from "../../util";
import { focusStyle } from "../../../ui";
import { COLORS } from "../../../color";


const fragment = graphql`
    fragment ChildOrderEditData on Realm {
        id
        name
        childOrder
        children { id name index }
        ...NavigationData
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



type Child = ChildOrderEditData$data["children"][0];
type SortOrder = Exclude<RealmOrder, "%future added value">;

type Props = {
    fragRef: ChildOrderEditData$key;
};

/** The actual implementation with a given realm path */
export const ChildOrder: React.FC<Props> = ({ fragRef }) => {
    const { t, i18n } = useTranslation();
    const realm = useFragment(fragment, fragRef);

    const initialSortOrder = realm.childOrder === "%future added value"
        // This is not optimal. The only useful thing we could do in the future
        // is to disable the whole form just to be save, whenever we encounter
        // a sort order we don't know.
        ? bug("unknown realm sort order")
        : realm.childOrder;
    const [sortOrder, setSortOrder] = useState<SortOrder>(initialSortOrder);
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
    const anyChange = initialSortOrder !== sortOrder
        || children.some((c, i) => c.id !== realm.children[i].id);

    const [commitError, setCommitError] = useState<JSX.Element | null>(null);
    const [commit, isInFlight] = useMutation(mutation);
    const save = async () => {
        commit({
            variables: {
                parent: realm.id,
                order: sortOrder,
                indices: sortOrder === "BY_INDEX"
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
            <label css={{ display: "flex" }}>
                <input
                    type="radio"
                    checked={order === sortOrder}
                    onChange={() => setSortOrder(order)}
                    css={{
                        alignSelf: "center",
                        marginRight: 14,
                        height: 16,
                        width: 16,
                        flexShrink: 0,
                    }}
                />
                {label}
            </label>
        </div>
    );

    const sortedChildren = sortRealms(children, sortOrder, i18n.language);

    return <>
        <h2>{t("manage.realm.children.heading")}</h2>
        <div>
            <SortOrderOption
                label={t("manage.realm.children.sort-alphabetically-asc")}
                order="ALPHABETIC_ASC"
            />
            <SortOrderOption
                label={t("manage.realm.children.sort-alphabetically-desc")}
                order="ALPHABETIC_DESC"
            />
            <SortOrderOption
                label={t("manage.realm.children.order-manually") + ":"}
                order="BY_INDEX"
            />

            {sortOrder === "BY_INDEX" && <ChildList swap={swap}>
                {sortedChildren}
            </ChildList>}

            <div css={{ display: "flex", alignItems: "center" }}>
                <Button onClick={save} disabled={!anyChange}>{t("general.action.save")}</Button>
                {isInFlight && <Spinner size={20} css={{ marginLeft: 16 }} />}
            </div>
            {boxError(commitError)}
        </div>
    </>;
};


type ChildListProps = {
    children: readonly Child[];
    swap: (index: number) => void;
};

const ChildList: React.FC<ChildListProps> = ({ children, swap }) => (
    <ol css={{ maxWidth: 900, padding: 0 }}>
        {children.map((child, i) => <ChildEntry
            key={child.id}
            index={i}
            numChildren={children.length}
            swap={swap}
            realmName={child.name ?? unreachable("realm child without name")}
        />)}
    </ol>
);

type ChildEntryProps = {
    index: number;
    numChildren: number;
    swap: (index: number) => void;
    realmName: string;
};

const ChildEntry: React.FC<ChildEntryProps> = ({ index, swap, realmName, numChildren }) => {
    const { t } = useTranslation();
    const isDark = useColorScheme().scheme === "dark";

    return (
        <li css={{
            display: "flex",
            alignItems: "center",
            border: `1px solid ${COLORS.neutral25}`,
            margin: "4px 0",
            borderRadius: 4,
        }}>
            <div css={{
                display: "flex",
                flexDirection: "column",
                marginRight: 16,
                fontSize: 18,
                borderRight: `1px solid ${COLORS.neutral25}`,
                "& > div": {
                    "&:first-child > button": {
                        borderBottom: `1px solid ${COLORS.neutral25}`,
                        borderTopLeftRadius: 4,
                    },
                    "&:last-child > button": {
                        borderBottomLeftRadius: 4,
                    },
                },
                "& button": {
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    padding: "5px 12px",
                    backgroundColor: "inherit",
                    ...isDark && { color: COLORS.neutral60 },
                    "&:disabled": {
                        color: "transparent",
                    },
                    "&:not([disabled])": {
                        cursor: "pointer",
                        "&:hover, &:focus": {
                            backgroundColor: COLORS.neutral10,
                            ...isDark && {
                                backgroundColor: COLORS.neutral15,
                                color: COLORS.neutral80,
                            },
                        },
                        ...focusStyle({ offset: -1.5 }),
                    },
                },
            }}>
                <WithTooltip tooltip={t("manage.realm.children.move-up")} placement="left">
                    <button onClick={() => swap(index - 1)} disabled={index === 0}>
                        <LuArrowUp />
                    </button>
                </WithTooltip>
                <WithTooltip tooltip={t("manage.realm.children.move-down")} placement="left">
                    <button onClick={() => swap(index)} disabled={index === numChildren - 1}>
                        <LuArrowDown />
                    </button>
                </WithTooltip>
            </div>
            <div css={{ padding: 4 }}>{realmName}</div>
        </li>
    );
};
