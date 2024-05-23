import {
    useColorScheme,
    ProtoButton,
    WithTooltip,
    FloatingHandle,
    Floating,
    bug,
    notNullish,
    screenWidthAtMost,
} from "@opencast/appkit";
import {
    createContext,
    useRef,
    useState,
    useContext,
    ReactNode,
    Dispatch,
    SetStateAction,
    PropsWithChildren,
} from "react";
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
import { useNavBlocker } from "../routes/util";
import { currentRef } from "../util";
import { Button } from "@opencast/appkit";
import { ModalHandle, Modal } from "@opencast/appkit";
import { ConfirmationModal, ConfirmationModalHandle } from "./Modal";
import { Spinner } from "./Spinner";
import { PermissionLevel, PermissionLevels } from "../util/permissionLevels";




export type Acl = Map<string, {
    actions: Set<string>;
    info?: RoleInfo | null;
}>;

export type RoleInfo = {
    label: TranslatedLabel;
    implies?: readonly string[] | null;
    large: boolean;
};

type SelectOption = {
    role: string;
    label: string;
}

type AclContext = {
    userIsRequired: boolean;
    acl: Acl;
    ownerDisplayName: string | null;
    permissionLevels: PermissionLevels;
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
    inheritedAcl?: Acl;
    /**
     * If `true`, the current user is included by default with `write` access and can't be removed.
     * This is necessary for the acl-selection in the uploader.
    */
    userIsRequired?: boolean;
    onChange: (newAcl: Acl) => void;
    knownRoles: AccessKnownRolesData$data;
    ownerDisplayName?: string | null;
    permissionLevels: PermissionLevels;
    addAnonymous?: boolean;
}

export const AclSelector: React.FC<AclSelectorProps> = (
    {
        acl,
        inheritedAcl = new Map(),
        userIsRequired = false,
        onChange,
        knownRoles,
        ownerDisplayName = "",
        permissionLevels,
        addAnonymous = true,
    }
) => {
    const { i18n } = useTranslation();
    const knownGroups = [...knownRoles.knownGroups];
    [acl, inheritedAcl].forEach(list =>
        insertBuiltinRoleInfo(list, knownGroups, i18n, addAnonymous));
    const [groupAcl, userAcl] = splitAcl(acl);
    const [inheritedGroupAcl, inheritedUserAcl] = splitAcl(inheritedAcl);

    const change: AclContext["change"] = f => {
        const copy = new Map([...acl.entries()].map(([role, value]) => [role, {
            actions: new Set(value.actions),
            info: value.info,
        }]));
        f(copy);
        onChange(copy);
    };

    const context = {
        userIsRequired,
        acl,
        change,
        groupDag: buildDag(knownGroups),
        ownerDisplayName,
        permissionLevels,
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
            <AclSelect kind="group" acl={groupAcl} inheritedAcl={inheritedGroupAcl} />
            <AclSelect kind="user" acl={userAcl} inheritedAcl={inheritedUserAcl} />
        </div>
    </AclContext.Provider>;
};

type RoleKind = "group" | "user";


export const knownRolesFragment = graphql`
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
     * evaluated and fallback to just the role.
     */
    label: string;

    /** Whether this is a large group. `false` for unknown roles. */
    large: boolean;
};

type AclSelectProps = SelectProps & {
    acl: Acl;
    inheritedAcl: Acl;
    kind: RoleKind;
};

/** One of the two columns for either users or groups. */
const AclSelect: React.FC<AclSelectProps> = ({ acl, inheritedAcl, kind }) => {
    const isDark = useColorScheme().scheme === "dark";
    const user = useUser();
    const { t, i18n } = useTranslation();
    const { change, knownGroups, groupDag, permissionLevels, ownerDisplayName } = useAclContext();
    const [menuIsOpen, setMenuIsOpen] = useState<boolean>(false);
    const userIsOwner = isRealUser(user) && user.displayName === ownerDisplayName;
    const [error, setError] = useState<ReactNode>(null);

    // Sort the active ACL entries (and put them into a new variable for that).
    let entries: Entry[] = [...acl.entries()].map(([role, { actions, info }]) => ({
        role,
        actions,
        label: getLabel(role, info?.label, i18n),
        large: info?.large ?? false,
    }));
    if (kind === "group") {
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

    const inheritedEntries: Entry[] = [...inheritedAcl.entries()]
        .map(([role, { actions, info }]) => ({
            role,
            actions,
            label: getLabel(role, info?.label, i18n),
            large: false, // Don't show any warning on inherited entries as they can't be changed.
        }));

    const userIsAdmin = isRealUser(user) && user.roles.includes(COMMON_ROLES.ADMIN);
    const showAdminEntry = kind === "group"
        && !entries.some(e => e.role === COMMON_ROLES.ADMIN)
        && userIsAdmin;

    const userIsGlobalPageAdmin = isRealUser(user)
        && user.roles.includes(COMMON_ROLES.TOBIRA_GLOBAL_PAGE_ADMIN);
    const showGlobalPageAdminEntry = kind === "group"
        && !entries.some(e => e.role === COMMON_ROLES.TOBIRA_GLOBAL_PAGE_ADMIN)
        && userIsGlobalPageAdmin;

    const showUserEntry = (kind === "user" && ownerDisplayName);
    const noEntries = entries.length === 0
        && !(showAdminEntry || showUserEntry || showGlobalPageAdminEntry);

    const remove = (item: Entry) => change(prev => prev.delete(item.role));

    const handleCreate = (inputValue: string) => change(prev => {
        prev.set(inputValue, {
            // If "create" is called, a new option is created, meaning that we
            // don't know the role.
            info: null,
            actions: new Set([permissionLevels.default]),
        });
    });

    const handleChange = (choice: MultiValue<SelectOption>) => change(prev => {
        choice
            .filter(option => !acl.has(option.role))
            .forEach(option => {
                const info = knownGroups.get(option.role);
                prev.set(option.role, {
                    actions: new Set([permissionLevels.default]),
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
        placeholder: t(`manage.access.select.${kind}s`),
        // TODO: for users, this should say "type to search" or "enter
        // username, email, ... to add user" depending on the
        // users_searchable config.
        noOptionsMessage: kind === "group"
            ? () => t("general.form.select.no-options")
            : ({ inputValue }: { inputValue: string }) => (
                t(`manage.access.users-no-options.${
                    inputValue.length === 0 ? "initial" : "none-found"
                }-${CONFIG.usersSearchable ? "" : "not-"}searchable`)
            ),
        isValidNewOption: (input: string) => {
            const validUserRole = isUserRole(input);
            const validRole = /^ROLE_\w+/.test(input);
            return kind === "group" ? (validRole && !validUserRole) : validUserRole;
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
        <strong>{t(`manage.access.authorized-${kind}s`)}</strong>
        {error && <Card kind="error" css={{ marginBottom: 8 }}>{error}</Card>}
        {kind === "group"
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

                                setError(null);
                                callback(users.items
                                    .filter(item => item.displayName !== ownerDisplayName)
                                    .map(item => ({
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
            <Table header={<>
                <th>{t(`manage.access.table.${kind}`)}</th>
                <th>{t("manage.access.table.actions.title")}</th>
                <th></th></>
            }>
                {/* Placeholder if there are no entries */}
                {noEntries && <tr>
                    <td colSpan={3} css={{ textAlign: "center", fontStyle: "italic" }}>
                        {t("acl.no-entries")}
                    </td>
                </tr>}

                {entries.map(entry =>
                    <ListEntry key={entry.role} item={entry} {...{ remove, kind }} />)
                }

                {/*
                    The ACLs usually don't explicitly include admins, but showing that
                    entry makes sense if the user is admin. Same for the global page admin.
                */}
                {showAdminEntry && <TableRow
                    labelCol={<>{t("acl.groups.admins")}</>}
                    actionCol={<UnchangeableAllActions />}
                />}
                {showGlobalPageAdminEntry && <TableRow
                    labelCol={<>{t("acl.groups.global-page-admins")}</>}
                    actionCol={<UnchangeableAllActions />}
                />}

                {/*
                    Similarly to the above, the ACL for user realms does not explicitly
                    include that realm's owning user, but it should still be shown in the UI.
                */}
                {showUserEntry && <TableRow
                    labelCol={!userIsOwner ? <>{ownerDisplayName}</> : <>
                        <i>{t("manage.access.table.yourself")}</i>
                            &nbsp;({ownerDisplayName})
                    </>}
                    actionCol={<UnchangeableAllActions />}
                />}
            </Table>

            {/* Inherited ACL */}
            {inheritedAcl.size > 0 && <Table header={
                <th colSpan={3}>
                    <span css={{
                        display: "flex",
                        justifyContent: "space-between",
                        paddingRight: 12,
                    }}>
                        {t("manage.access.table.inherited")}
                        <InfoWithTooltip
                            mode="info"
                            tooltip={t("manage.access.table.inherited-tooltip")}
                        />
                    </span>
                </th>
            }>
                {inheritedEntries.map(entry =>
                    <ListEntry key={entry.role} item={entry} inherited {...{ kind }} />)
                }
            </Table>}
        </div>
    </div>;
};

type TableProps = PropsWithChildren<{
    header?: ReactNode;
}>

const Table: React.FC<TableProps> = ({ children, header }) => {
    const { i18n } = useTranslation();
    const { permissionLevels } = useAclContext();

    return (
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
                <col />
                <col css={{
                    // This is a little hacky and kind of messy.
                    // We want the width of the action columns to be fixed
                    // and determined by the longest action label (e.g. `read and write`
                    // should also determine the width of the `read` label). These lengths are
                    // of course also dependent on the current language (german for example
                    // has a reputation for having ridiculously lengthy words).
                    // Now that we use this selector also for realm acl that use different
                    // labels altogether, this needs yet another check.
                    // This will of course become even more complicated once more languages are
                    // added.
                    width: permissionLevels.highest === "admin"
                        ? i18n.resolvedLanguage === "en" ? 160 : 165
                        : i18n.resolvedLanguage === "en" ? 190 : 224,
                }} />
                <col css={{ width: 42 }} />
            </colgroup>
            <thead>
                <tr css={{
                    borderBottom: `2px solid ${COLORS.neutral05}`,
                    textAlign: "left",
                }}>{header}</tr>
            </thead>
            <tbody>{children}</tbody>
        </table>
    );
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
    remove?: (item: Entry) => void;
    inherited?: boolean;
}

const ListEntry: React.FC<ListEntryProps> = ({ remove, item, kind, inherited = false }) => {
    const user = useUser();
    const { t, i18n } = useTranslation();
    const { userIsRequired, acl, groupDag, permissionLevels } = useAclContext();

    const entryContainsActions = (actions: PermissionLevel[]) =>
        actions.every(action => item.actions.has(action));

    let noteworthyAccessType: PermissionLevel | null = null;
    if (entryContainsActions(["write"])) {
        noteworthyAccessType = "write";
    } else if (entryContainsActions(["admin"])) {
        noteworthyAccessType = "admin";
    } else if (entryContainsActions(["moderate"]) && !entryContainsActions(["admin"])) {
        noteworthyAccessType = "moderate";
    }

    const supersets = kind === "user" ? [] : groupDag
        .supersetsOf(item.role)
        .filter(role => {
            const actions = acl.get(role)?.actions;
            return actions && [...item.actions].every(action => actions?.has(action));
        })
        .map(role => getLabel(role, acl.get(role)?.info?.label, i18n));
    const isSubset = !inherited && supersets.length > 0;
    const isUser = isRealUser(user) && item.role === user.userRole;
    const immutable = item.role === COMMON_ROLES.ADMIN || userIsRequired && isUser || inherited;

    let label: JSX.Element;
    if (isUser) {
        label = <span><i>{t("manage.access.table.yourself")}</i>&nbsp;({item.label})</span>;
    } else if (kind === "user" && isUserRole(item.label)) {
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

    return <TableRow
        labelCol={<>
            {label}
            {isSubset && <InfoWithTooltip mode="info" tooltip={
                t("manage.access.table.subset-warning", { groups: supersets.join(", ") })
            } />}
        </>}
        mutedLabel={isSubset || inherited}
        actionCol={immutable
            ? <UnchangeableAllActions permission={getActionLabel(item, permissionLevels)} />
            : <>
                <ActionsMenu {...{ item, kind }} />
                {item.large && noteworthyAccessType
                    ? <InfoWithTooltip
                        mode="warning"
                        tooltip={t("manage.access.table.actions.large-group-warning", {
                            val: t(`manage.access.table.actions.${noteworthyAccessType}-access`),
                        })}
                    />
                    : <div css={{ width: 22 }} />
                }
            </>}
        onRemove={immutable ? undefined : () => remove && remove(item)}
        {...{ inherited }}
    />;
};


type TableRowProps = {
    labelCol: JSX.Element;
    mutedLabel?: boolean;
    actionCol: JSX.Element;
    onRemove?: () => void;
    inherited?: boolean;
}

const TableRow: React.FC<TableRowProps> = (
    { labelCol, mutedLabel, actionCol, onRemove, inherited }
) => (
    <tr css={{
        height: 44,
        ...!inherited && { ":hover, :focus-within":
            { td: { backgroundColor: COLORS.neutral15 } },
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


type InfoWithTooltipProps = {
    tooltip: string;
    mode: "info" | "warning";
}

const InfoWithTooltip: React.FC<InfoWithTooltipProps> = ({ tooltip, mode }) => (
    <WithTooltip
        {...{ tooltip }}
        css={{ display: "flex", fontWeight: "normal" }}
        tooltipCss={{ width: "min(85vw, 460px)" }}
    >
        <span css={{ marginLeft: 6, display: "flex", alignItems: "center" }}>
            {mode === "info" ? <LuInfo /> : <LuAlertTriangle css={{ color: COLORS.danger0 }}/>}
        </span>
    </WithTooltip>
);

const UnchangeableAllActions: React.FC<{ permission?: PermissionLevel }> = ({ permission }) => {
    const { t } = useTranslation();
    const { permissionLevels } = useAclContext();
    const label = permission ?? permissionLevels.highest;
    return <span css={{ marginLeft: 8 }}>{t(`manage.access.table.actions.${label}`)}</span>;
};

const ActionsMenu: React.FC<ItemProps> = ({ item, kind }) => {
    const isDark = useColorScheme().scheme === "dark";
    const ref = useRef<FloatingHandle>(null);
    const { t } = useTranslation();
    const { change, permissionLevels } = useAclContext();
    const allLabels = Object.keys(permissionLevels.all) as PermissionLevel[];
    const currentActionOption = getActionLabel(item, permissionLevels);

    const changeOption = (newOption: PermissionLevel) => change(prev => {
        notNullish(prev.get(item.role)).actions
            = notNullish(permissionLevels.all[newOption]).actions;
    });

    return (
        <FloatingBaseMenu
            ref={ref}
            label={t("manage.access.table.actions.title")}
            triggerContent={<>{t(`manage.access.table.actions.${currentActionOption}`)}</>}
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
                        {allLabels.map(actionOption => <ActionMenuItem
                            key={actionOption}
                            disabled={actionOption === currentActionOption}
                            label={t(`manage.access.table.actions.${actionOption}`)}
                            description={
                                t(`manage.access.table.actions.${actionOption}-description`,
                                    { count: kind === "user" ? 1 : 2 })
                            }
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


/* Optional reset and save buttons to use if selector is not part of a larger form */
type AclEditButtonsProps = {
    selections: Acl;
    setSelections: Dispatch<SetStateAction<Acl>>;
    initialAcl: Acl;
    onSubmit: (acl: Acl) => Promise<void>;
    className?: string;
    inFlight?: boolean;
    inheritedAcl?: Acl;
    userIsOwner?: boolean;
    kind: "write" | "admin";
    saveModalRef: React.RefObject<ConfirmationModalHandle>;
}

export const AclEditButtons: React.FC<AclEditButtonsProps> = (
    {
        selections,
        setSelections,
        initialAcl,
        onSubmit,
        className,
        inFlight,
        inheritedAcl,
        userIsOwner,
        saveModalRef,
        kind,
    }
) => {
    const { t } = useTranslation();
    const user = useUser();
    const resetModalRef = useRef<ModalHandle>(null);

    const containsUser = (acl: Acl) => isRealUser(user) && (userIsOwner || user.roles.some(r =>
        r === COMMON_ROLES.ADMIN
        || acl.get(r)?.actions.has(kind)
        || inheritedAcl?.get(r)?.actions.has(kind))
    );

    const selectionIsInitial = selections.size === initialAcl.size
        && [...selections].every(([role, info]) => {
            const other = initialAcl.get(role);
            return other && areSetsEqual(other.actions, info.actions);
        });

    const submit = onSubmit;

    useNavBlocker(!selectionIsInitial);

    return (
        <div {...{ className }} css={{
            display: "flex",
            gap: 8,
            alignSelf: "flex-start",
            marginTop: 40,
        }}>
            {/* Reset button */}
            <Button
                disabled={selectionIsInitial}
                onClick={() => currentRef(resetModalRef).open()}
                css={{ ...!selectionIsInitial && { ":hover": { color: COLORS.danger0 } } }}
            >
                {t("manage.access.reset-modal.label")}
            </Button>
            <Modal
                ref={resetModalRef}
                title={t("manage.access.reset-modal.title")}
                text={{ generalActionClose: t("general.action.close") }}
            >
                <p>{t("manage.access.reset-modal.body")}</p>
                <div css={{
                    display: "flex",
                    gap: 12,
                    justifyContent: "center",
                    flexWrap: "wrap",
                    marginTop: 32,
                }}>
                    <Button onClick={() => currentRef(resetModalRef).close?.()}>
                        {t("general.action.cancel")}
                    </Button>
                    <Button kind="danger" onClick={() => {
                        setSelections(initialAcl);
                        currentRef(resetModalRef).close?.();
                    }}>{t("manage.access.reset-modal.label")}</Button>
                </div>
            </Modal>

            {/* Save button */}
            <Button
                disabled={selectionIsInitial}
                onClick={() =>
                    !containsUser(selections)
                        ? currentRef(saveModalRef).open()
                        : submit(selections)
                }
                css={{ ...!selectionIsInitial && { ":hover": { color: COLORS.happy0 } } }}
            >{t("general.action.save")}</Button>
            {inFlight && <div css={{ marginTop: 16 }}><Spinner size={20} /></div>}
            <ConfirmationModal
                ref={saveModalRef}
                title={t("manage.access.save-modal.title")}
                buttonContent={t("manage.access.save-modal.confirm")}
                onSubmit={() => submit(selections)}
                text={{ generalActionClose: t("general.action.close") }}
            >
                <p>{t(`manage.access.save-modal.disclaimer-${kind}`)}</p>
            </ConfirmationModal>
        </div>
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

/** Returns label for the currently selected action of a role entry */
const getActionLabel = (item: Entry, permissionLevels: PermissionLevels): PermissionLevel =>
    (Object.keys(permissionLevels.all).find(level => {
        const lvl = permissionLevels.all[level as PermissionLevel]?.actions;
        return lvl && areSetsEqual(lvl, item.actions);
    }) ?? "unknown") as PermissionLevel;

const isUserRole = (role: string) =>
    CONFIG.auth.userRolePrefixes.some(prefix => role.startsWith(prefix));

const areSetsEqual = (a: Set<string>, b: Set<string>) =>
    a.size === b.size && [...a].every((str => b.has(str)));

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
    addAnonymous: boolean,
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

    if (addAnonymous) {
        knownGroups.push({ role: COMMON_ROLES.ANONYMOUS, ...anonymousInfo });
    }
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
