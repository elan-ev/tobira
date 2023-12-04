import {
    useColorScheme,
    match,
    ProtoButton,
    WithTooltip,
    FloatingHandle,
    Floating,
    bug,
    notNullish,
    screenWidthAtMost,
} from "@opencast/appkit";
import { createContext, useRef, useState, useContext, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LuX, LuAlertTriangle, LuInfo } from "react-icons/lu";
import { MultiValue } from "react-select";
import CreatableSelect from "react-select/creatable";
import AsyncCreatableSelect from "react-select/async-creatable";
import { fetchQuery, graphql } from "react-relay";
import { i18n, ParseKeys } from "i18next";

import { focusStyle } from ".";
import { useUser, isRealUser } from "../User";
import { COLORS } from "../color";
import { COMMON_ROLES } from "../util/roles";
import { SelectProps } from "./Input";
import { searchableSelectStyles, theme } from "./SearchableSelect";
import { FloatingBaseMenu } from "./FloatingBaseMenu";
import { AccessKnownRolesData$data } from "./__generated__/AccessKnownRolesData.graphql";
import CONFIG from "../config";
import { Card } from "./Card";
import { environment } from "../relay";
import { AccessUserSearchQuery } from "./__generated__/AccessUserSearchQuery.graphql";
import { ErrorDisplay } from "../util/err";




export type Acl = Map<string, {
    actions: Set<string>;
    info: RoleInfo | null;
}>;

export type RoleInfo = {
    label: TranslatedLabel;
    implies: readonly string[] | null;
    large: boolean;
};

type Action = "read" | "write";

type SelectOption = {
    role: string;
    label: string;
}

type AclContext = {
    userIsRequired: boolean;
    acl: Acl;
    change: (f: (acl: Acl) => void) => void;
    knownGroups: Map<string, {
        label: TranslatedLabel;
        implies: Set<string>;
        large: boolean;
    }>;
    groupDag: GroupDag;
}

const AclContext = createContext<AclContext | null>(null);

const useAclContext = () => useContext(AclContext) ?? bug("Acl context is not initialized!");

type AclSelectorProps = {
    acl: Acl;
    /**
     * If `true`, the current user is included by default with `write` access and can't be removed.
     * This is necessary for the acl-selection in the uploader.
     */
    userIsRequired?: boolean;
    onChange: (newAcl: Acl) => void;
    knownRoles: AccessKnownRolesData$data;
}

export const AclSelector: React.FC<AclSelectorProps> = (
    { acl, userIsRequired = false, onChange, knownRoles }
) => {
    const { i18n } = useTranslation();
    const knownGroups = [...knownRoles.knownGroups];
    insertBuiltinRoleInfo(acl, knownGroups, i18n);
    const [groupAcl, userAcl] = splitAcl(acl);
    const change: AclContext["change"] = f => {
        const copy = new Map([...acl.entries()].map(([role, value]) => [role, {
            actions: new Set(value.actions),
            info: value.info == null ? null : {
                label: value.info.label,
                implies: value.info.implies,
                large: value.info.large,
            },
        }]));
        f(copy);
        onChange(copy);
    };

    const context = {
        userIsRequired,
        acl,
        change,
        groupDag: buildDag(knownGroups),
        knownGroups: new Map(knownGroups.map(g => [g.role, {
            label: g.label,
            implies: new Set(g.implies),
            large: g.large,
        }])),
    };
    return <AclContext.Provider value={context}>
        <div css={{
            display: "flex",
            flexWrap: "wrap",
            gap: 24,
        }}>
            <AclSelect kind="Group" acl={groupAcl} />
            <AclSelect kind="User" acl={userAcl} />
        </div>
    </AclContext.Provider>;
};

type RoleKind = "Group" | "User";


export const knownRolesFragement = graphql`
    fragment AccessKnownRolesData on Query {
        knownGroups { role label implies large }
    }
`;

/**
 * An entry in the active ACL list. Very similar but still different from
 * `AclItem` from the API.
 */
type Entry = {
    role: string;
    actions: Set<string>;

    /**
     * Resolved label. The value from the API, but also built-in groups
     * evaulated and fallback to just the role.
     */
    label: string;

    /** Whether this is a large group. `false` for unknown roles. */
    large: boolean;
};

type AclSelectProps = SelectProps & {
    acl: Acl;
    kind: RoleKind;
};

/** One of the two columns for either users or groups. */
const AclSelect: React.FC<AclSelectProps> = ({ acl, kind }) => {
    const isDark = useColorScheme().scheme === "dark";
    const user = useUser();
    const { t, i18n } = useTranslation();
    const { change, knownGroups, groupDag } = useAclContext();
    const [menuIsOpen, setMenuIsOpen] = useState<boolean>(false);
    const userIsAdmin = isRealUser(user) && user.roles.includes(COMMON_ROLES.ADMIN);
    const [error, setError] = useState<ReactNode>(null);

    const translations = match(kind, {
        "Group": () => ({
            heading: t("manage.access.authorized-groups"),
            placeholder: t("manage.access.select.groups"),
            columnHeader: t("manage.access.table.group"),
        }),
        "User": () => ({
            heading: t("manage.access.authorized-users"),
            placeholder: t("manage.access.select.users"),
            columnHeader: t("manage.access.table.user"),
        }),
    });

    // Sort the active ACL entries (and put them into a new variable for that).
    let entries: Entry[] = [...acl.entries()].map(([role, { actions, info }]) => ({
        role,
        actions,
        label: getLabel(role, info?.label, i18n),
        large: info?.large ?? false,
    }));
    if (kind === "Group") {
        // Sort large groups to the top.
        entries = groupDag.sort(entries);
    } else {
        // Always show the current user first, if included. Then show all known
        // users, then all unknown ones, both in alphabetical order.
        const collator = new Intl.Collator(i18n.resolvedLanguage, { sensitivity: "base" });
        entries.sort((a, b) => {
            const section = (x: Entry) => {
                if (isRealUser(user) && x.role === user.userRole) {
                    return 0;
                }
                if (x.label.startsWith("ROLE_")) {
                    return 2;
                }
                return 1;
            };

            const sectionDiff = section(a) - section(b);
            if (sectionDiff !== 0) {
                return sectionDiff;
            }

            return collator.compare(a.label, b.label);
        });
    }

    const remove = (item: Entry) => change(prev => prev.delete(item.role));

    const handleCreate = (inputValue: string) => change(prev => {
        prev.set(inputValue, {
            // If "create" is called, a new option is created, meaning that we
            // don't know the role.
            info: null,
            actions: new Set(["read"]),
        });
    });

    const handleChange = (choice: MultiValue<SelectOption>) => change(prev => {
        choice
            .filter(option => !acl.has(option.role))
            .forEach(option => {
                const info = knownGroups.get(option.role);
                prev.set(option.role, {
                    actions: new Set(["read"]),
                    info: {
                        label: info?.label ?? { "_": option.label },
                        implies: [...info?.implies ?? new Set()],
                        large: info?.large ?? false,
                    },
                });
            });
    });


    const commonSelectProps = {
        onMenuOpen: () => setMenuIsOpen(true),
        onMenuClose: () => setMenuIsOpen(false),
        menuIsOpen,
        controlShouldRenderValue: false,
        isClearable: false,
        isMulti: true,
        isSearchable: true,
        backspaceRemovesValue: false,
        placeholder: translations.placeholder,
        // TODO: for users, this should say "type to search" or "enter
        // username, email, ... to add user" depending on the
        // users_searchable config.
        noOptionsMessage: () => t("general.form.select.no-options"),
        isValidNewOption: (input: string) => {
            const validUserRole = isUserRole(input);
            const validRole = /^ROLE_\w+/.test(input);
            return kind === "Group" ? (validRole && !validUserRole) : validUserRole;
        },
        formatCreateLabel: (input: string) => t("manage.access.select.create", { item: input }),
        value: entries.map(e => ({ role: e.role, label: e.label })),
        getOptionValue: (option: SelectOption) => option.role,
        onCreateOption: handleCreate,
        onChange: handleChange,
        styles: searchableSelectStyles(isDark),
        css: { marginTop: 6 },
        theme,
    } as const;

    return <div css={{
        flex: "1 1 420px",
        display: "flex",
        flexDirection: "column",
        maxWidth: 700,

        [screenWidthAtMost(480)]: {
            flexBasis: 280,
        },
    }}>
        <strong>{translations.heading}</strong>
        {error && <Card kind="error" css={{ marginBottom: 8 }}>{error}</Card>}
        {kind === "Group"
            ? <CreatableSelect
                {...commonSelectProps}
                options={[...knownGroups.entries()].map(([role, { label }]) => ({
                    role,
                    label: getLabel(role, label, i18n),
                }))}
            />
            : <AsyncCreatableSelect
                {...commonSelectProps}
                loadOptions={(q: string, callback: (options: readonly SelectOption[]) => void) => {
                    fetchQuery<AccessUserSearchQuery>(environment, userSearchQuery, { q })
                        .subscribe({
                            next: ({ users }) => {
                                if (users.items === undefined) {
                                    setError(t("search.unavailable"));
                                    return;
                                }

                                callback(users.items.map(item => ({
                                    role: item.userRole,
                                    label: item.displayName,
                                })));
                            },
                            start: () => {},
                            error: (error: Error) => setError(<ErrorDisplay error={error} />),
                        });
                }}
            />
        }
        <div>
            <table css={{
                marginTop: 20,
                tableLayout: "fixed",
                width: "100%",
                borderRadius: 4,
                borderCollapse: "collapse",
                backgroundColor: COLORS.neutral10,
                "th, td": {
                    padding: 6,
                    ":first-of-type": {
                        paddingLeft: 12,
                        overflowWrap: "anywhere",
                    },
                },
                [screenWidthAtMost(480)]: {
                    fontSize: 14,
                    "> colgroup > col:nth-of-type(2)": { width: "unset" },
                    "> colgroup > col:nth-of-type(3)": { width: 35 },
                },
            }}>
                <colgroup>
                    <col css={{ }} />
                    <col css={{ width: i18n.resolvedLanguage === "en" ? 190 : 224 }} />
                    <col css={{ width: 42 }} />
                </colgroup>
                <thead>
                    <tr css={{
                        borderBottom: `2px solid ${COLORS.neutral05}`,
                        textAlign: "left",
                    }}>
                        <th>{translations.columnHeader}</th>
                        <th>{t("manage.access.table.actions.title")}</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {/* Placeholder if there are no entries */}
                    {entries.length === 0 && !userIsAdmin && <tr>
                        <td colSpan={3} css={{ textAlign: "center", fontStyle: "italic" }}>
                            {t("acl.no-entries")}
                        </td>
                    </tr>}

                    {entries.map(entry =>
                        <ListEntry key={entry.role} item={entry} {...{ remove, kind }} />)
                    }

                    {/*
                    The ACLs usually don't explicitly include admins, but showing that
                    entry makes sense if the user is admin.
                    */}
                    {(
                        kind === "Group"
                        && !entries.some(e => e.role === COMMON_ROLES.ADMIN)
                        && userIsAdmin
                    ) && (
                        <TableRow
                            labelCol={<>{t("acl.groups.admins")}</>}
                            actionCol={<UnchangableAllActions />}
                        />
                    )}
                </tbody>
            </table>
        </div>
    </div>;
};

const userSearchQuery = graphql`
    query AccessUserSearchQuery($q: String!) {
        users: searchKnownUsers(query: $q) {
            ... on KnownUserSearchResults {
                items { displayName userRole }
            }
        }
    }
`;

type ItemProps = {
    item: Entry;
    kind: RoleKind;
}

type ListEntryProps = ItemProps & {
    remove: (item: Entry) => void;
}

const ListEntry: React.FC<ListEntryProps> = ({ remove, item, kind }) => {
    const user = useUser();
    const { t, i18n } = useTranslation();
    const { userIsRequired, acl, groupDag } = useAclContext();

    const canWrite = item.actions.has("write");
    const supersets = kind === "User" ? [] : groupDag
        .supersetsOf(item.role)
        .filter(role => {
            const actions = acl.get(role)?.actions;
            return actions && actions.has("read") && (!canWrite || actions.has("write"));
        })
        .map(role => getLabel(role, acl.get(role)?.info?.label, i18n));
    const isSubset = supersets.length > 0;
    const isUser = isRealUser(user) && item.role === user.userRole;

    let label: JSX.Element;
    if (isUser) {
        label = <span><i>{t("manage.access.table.yourself")}</i>&nbsp;({item.label})</span>;
    } else if (kind === "User" && isUserRole(item.label)) {
        // We strip the user role prefix (we take the longest prefix that
        // matches, though in almost all cases just a single one will match).
        // We then clean it a bit before displaying.
        const prefixes = CONFIG.auth.userRolePrefixes
            .filter(prefix => item.label.startsWith(prefix));
        const name = item.role.slice(Math.max(...prefixes.map(p => p.length)))
            .toLocaleLowerCase(i18n.resolvedLanguage)
            .replace("_", " ");
        label = <span>{name} (<i>{t("acl.unknown-user-note")}</i>)</span>;
    } else {
        label = <>{item.label}</>;
    }

    const immutable = item.role === COMMON_ROLES.ADMIN || userIsRequired && isUser;
    return <TableRow
        labelCol={<>
            {label}
            {isSubset && <Warning info tooltip={
                t("manage.access.table.subset-warning", { groups: supersets.join(", ") })
            } />}
        </>}
        mutedLabel={isSubset}
        actionCol={immutable ? <UnchangableAllActions /> : <>
            <ActionsMenu {...{ item, kind }} />
            {item.large && canWrite
                ? <Warning tooltip={t("manage.access.table.actions.large-group-warning")} />
                : <div css={{ width: 22 }} />
            }
        </>}
        onRemove={immutable ? undefined : () => remove(item)}
    />;
};


type TableRowProps = {
    labelCol: JSX.Element;
    mutedLabel?: boolean;
    actionCol: JSX.Element;
    onRemove?: () => void;
}

const TableRow: React.FC<TableRowProps> = ({ labelCol, mutedLabel, actionCol, onRemove }) => (
    <tr css={{
        height: 44,
        ":hover, :focus-within": {
            td: { backgroundColor: COLORS.neutral15 },
        },
        ...mutedLabel && { color: COLORS.neutral60 },
        borderBottom: `1px solid ${COLORS.neutral05}`,
        ":last-child": {
            border: "none",
            td: {
                ":first-child": { borderBottomLeftRadius: 4 },
                ":last-child": { borderBottomRightRadius: 4 },
            },
        },
    }}>
        <td>
            <span css={{ display: "flex" }}>{labelCol}</span>
        </td>
        <td>
            <div css={{
                display: "flex",
                "> div:first-of-type": { flex: "1" },
                [screenWidthAtMost(480)]: {
                    lineHeight: 1,
                },
            }}>
                {actionCol}
            </div>
        </td>
        <td>
            {onRemove && <ProtoButton
                onClick={onRemove}
                css={{
                    marginLeft: "auto",
                    display: "flex",
                    color: COLORS.neutral60,
                    borderRadius: 4,
                    padding: 4,
                    ":hover, :focus-visible": { color: COLORS.danger0 },
                    ...focusStyle({ offset: -1 }),
                }}
            >
                <LuX size={20} />
            </ProtoButton>}
        </td>
    </tr>
);


type WarningProps = {
    tooltip: string;
    info?: boolean;
}

const Warning: React.FC<WarningProps> = ({ tooltip, info }) => (
    <WithTooltip {...{ tooltip }} css={{ display: "flex" }}>
        <span css={{ marginLeft: 6, display: "flex", alignItems: "center" }}>
            {info ? <LuInfo /> : <LuAlertTriangle css={{ color: COLORS.danger0 }}/>}
        </span>
    </WithTooltip>
);

const UnchangableAllActions = () => {
    const { t } = useTranslation();
    return <span css={{ marginLeft: 8 }}>{t("manage.access.table.actions.write")}</span>;
};

const ActionsMenu: React.FC<ItemProps> = ({ item, kind }) => {
    const isDark = useColorScheme().scheme === "dark";
    const ref = useRef<FloatingHandle>(null);
    const { t } = useTranslation();
    const { change } = useAclContext();
    const currentActionOption = item.actions.has("write") ? "write" : "read";
    const changeOption = (newOption: "read" | "write") => change(prev => {
        notNullish(prev.get(item.role)).actions = new Set(
            newOption === "write" ? ["read", "write"] : ["read"]
        );
    });


    const actions: Action[] = ["read", "write"];

    const count = kind === "User" ? 1 : 2;
    const translations = (actionType: Action) => match(actionType, {
        "read": () => ({
            label: t("manage.access.table.actions.read"),
            description: t("manage.access.table.actions.read-description", { ...{ count } }),
        }),
        "write": () => ({
            label: t("manage.access.table.actions.write"),
            description: t("manage.access.table.actions.write-description", { ...{ count } }),
        }),
    });


    return (
        <FloatingBaseMenu
            ref={ref}
            label={t("manage.access.table.actions.title")}
            triggerContent={<>{translations(currentActionOption).label}</>}
            triggerStyles={{
                width: "100%",
                gap: 0,
                padding: "0 4px 0 8px",
                justifyContent: "space-between",
                ":hover, :focus-visible": { backgroundColor: COLORS.neutral20 },
                svg: { marginTop: 2, color: COLORS.neutral60 },
                [screenWidthAtMost(480)]: {
                    whiteSpace: "normal",
                    textAlign: "left",
                },
            }}
            list={
                <Floating
                    backgroundColor={isDark ? COLORS.neutral15 : COLORS.neutral05}
                    hideArrowTip
                    padding={0}
                    borderWidth={isDark ? 1 : 0}
                    css={{ minWidth: 125, lineHeight: 1.4 }}
                >
                    <ul css={{
                        listStyle: "none",
                        margin: 0,
                        padding: 0,
                    }}>
                        {actions.map(actionOption => <ActionMenuItem
                            key={actionOption}
                            disabled={actionOption === currentActionOption}
                            label={translations(actionOption).label}
                            description={translations(actionOption).description}
                            onClick={() => changeOption(actionOption)}
                            close={() => ref.current?.close()}
                        />)}
                    </ul>
                </Floating>
            }
        />
    );
};

type ActionMenuItemProps = {
    label: string;
    description: string;
    onClick: () => void;
    close: () => void;
    disabled: boolean;
};

const ActionMenuItem: React.FC<ActionMenuItemProps> = (
    { label, description, onClick, close, disabled }
) => {
    const ref = useRef<HTMLButtonElement>(null);
    const isDark = useColorScheme().scheme === "dark";

    return (
        <li css={{
            ":not(:last-child)": {
                borderBottom: `1px solid ${isDark ? COLORS.neutral40 : COLORS.neutral20}`,
            },
            ":last-child button": {
                borderRadius: "0 0 8px 8px",
            },
            ...disabled && { backgroundColor: COLORS.neutral10 },
        }}>
            <ProtoButton
                {...{ ref, disabled }}
                role="menuitem"
                onClick={() => {
                    onClick();
                    close();
                }}
                css={{
                    width: 300,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    svg: { fontSize: 16 },
                    ":hover:enabled, :focus:enabled ": {
                        backgroundColor: isDark ? COLORS.neutral10 : COLORS.neutral15,
                    },
                    ...focusStyle({ inset: true }),
                    "&[disabled]": {
                        cursor: "default",
                        span: {
                            fontWeight: "bold",
                            color: COLORS.neutral80,
                            pointerEvents: "none",
                        },
                    },
                }}
            >
                <div css={{
                    display: "flex",
                    flexDirection: "column",
                    padding: "8px 14px",
                    gap: 6,
                    textAlign: "left",
                }}>
                    <span>{label}</span>
                    <p css={{ fontSize: 14 }}>{description}</p>
                </div>
            </ProtoButton>
        </li>
    );
};


// ==============================================================================================
// ===== Helper functions
// ==============================================================================================

type TranslatedLabel = Record<string, string>;

/** Returns a label for the role, if known to Tobira. */
const getLabel = (role: string, label: TranslatedLabel | undefined, i18n: i18n) => {
    if (role === COMMON_ROLES.USER_ADMIN) {
        return i18n.t("acl.admin-user");
    }
    if (label) {
        return label[i18n.language] ?? label.en ?? label._;
    }
    return role;
};

const isUserRole = (role: string) =>
    CONFIG.auth.userRolePrefixes.some(prefix => role.startsWith(prefix));

/** Splits initial ACL into group and user roles. */
const splitAcl = (initialAcl: Acl): [Acl, Acl] => {
    const users = new Map();
    const groups = new Map();
    for (const [role, info] of initialAcl.entries()) {
        (isUserRole(role) ? users : groups).set(role, info);
    }
    return [groups, users];
};

const insertBuiltinRoleInfo = (
    acl: Acl,
    knownGroups: AccessKnownRolesData$data["knownGroups"][number][],
    i18n: i18n,
) => {
    const keyToTranslatedString = (key: ParseKeys): TranslatedLabel => Object.fromEntries(
        i18n.languages
            .filter(lng => i18n.exists(key, { lng }))
            .map(lng => [lng, i18n.t(key, { lng })])
    );

    const anonymousInfo = {
        implies: [],
        label: keyToTranslatedString("acl.groups.everyone"),
        large: true,
    };
    const userInfo = {
        implies: [COMMON_ROLES.ANONYMOUS],
        label: keyToTranslatedString("acl.groups.logged-in-users"),
        large: true,
    };

    const anonymous = acl.get(COMMON_ROLES.ANONYMOUS);
    if (anonymous) {
        anonymous.info = anonymousInfo;
    }
    const user = acl.get(COMMON_ROLES.USER);
    if (user) {
        user.info = userInfo;
    }

    knownGroups.push({ role: COMMON_ROLES.ANONYMOUS, ...anonymousInfo });
    knownGroups.push({ role: COMMON_ROLES.USER, ...userInfo });
};


/**
 * DAG to represent superset/subset relationships of available groups. Lazily
 * initialized.
 */
interface GroupDag {
    /** Returns all groups that include the given one, i.e. are supersets of it. */
    supersetsOf(groupRole: string): string[];

    /**
     * Topologically sorts the given groups such that large groups are first,
     * smaller ones last.
     */
    sort(groups: Entry[]): Entry[];
}

const buildDag = (groups: AccessKnownRolesData$data["knownGroups"]): GroupDag => {
    const vertices = new Map<string, Set<string>>();
    vertices.set(COMMON_ROLES.ANONYMOUS, new Set());
    vertices.set(COMMON_ROLES.USER, new Set([COMMON_ROLES.ANONYMOUS]));

    for (const { role, implies } of groups) {
        if (role !== COMMON_ROLES.ANONYMOUS && role !== COMMON_ROLES.USER) {
            vertices.set(role, new Set([COMMON_ROLES.USER, ...implies]));
        }
    }

    return {
        supersetsOf(start) {
            // If we don't know this group, we also have no idea about subset
            // relations except that it's a subset of ROLE_USER and ROLE_ANONYMOUS.
            // For the special admin role however, we never return supersets as
            // it's not useful to show a warning next to that.
            if (!vertices.has(start)) {
                return start === COMMON_ROLES.ADMIN
                    ? []
                    : [COMMON_ROLES.ANONYMOUS, COMMON_ROLES.USER];
            }

            const supersets = new Set<string>();
            const stack = [start];

            while (stack.length > 0) {
                const v = notNullish(stack.pop());
                if (supersets.has(v)) {
                    continue;
                }
                const directSupersets = vertices.get(v) ?? bug(`group ${v} not found in DAG`);
                for (const s of directSupersets) {
                    stack.push(s);
                }
                if (v !== start) {
                    supersets.add(v);
                }
            }

            return [...supersets];
        },

        sort(options) {
            const visited = new Set<string>();
            const out = [];

            // Mapping from node to its subsets.
            const inverseVertices = new Map<string, Set<string>>();
            vertices.forEach((_, role) => inverseVertices.set(role, new Set()));
            for (const [role, supersets] of vertices) {
                for (const s of supersets) {
                    inverseVertices.get(s)?.add(role);
                }
            }


            // We can always start with ROLE_ANONYMOUS as that's a supserset of
            // everything.
            const candidates = [COMMON_ROLES.ANONYMOUS];
            while (candidates.length > 0) {
                const candidate = notNullish(candidates.pop());

                const option = options.find(o => o.role === candidate);
                if (option) {
                    out.push(option);
                }

                visited.add(candidate);
                for (const subset of inverseVertices.get(candidate) ?? []) {
                    const supersets = vertices.get(subset) ?? bug("DAG inconsistent");

                    // If we already visited all supersets of this, it can now
                    // itself be visited. In other words: now we've done our
                    // deed and added all options that have to come before.
                    if ([...supersets].every(s => visited.has(s))) {
                        candidates.push(subset);
                    }
                }
            }

            // Add remaining inputs, i.e. unknown roles.
            for (const option of options) {
                if (!visited.has(option.role)) {
                    out.push(option);
                }
            }

            return out;
        },
    };
};
