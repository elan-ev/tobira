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
import { createContext, useRef, useState, useContext } from "react";
import { useTranslation } from "react-i18next";
import { FiX, FiAlertTriangle } from "react-icons/fi";
import { MultiValue } from "react-select";
import CreatableSelect from "react-select/creatable";
import { graphql } from "react-relay";
import { i18n } from "i18next";

import { focusStyle } from ".";
import { useUser, isRealUser, UserState } from "../User";
import { COLORS } from "../color";
import { COMMON_ROLES } from "../util/roles";
import { SelectProps } from "./Input";
import { searchableSelectStyles, theme } from "./SearchableSelect";
import { FloatingBaseMenu } from "./FloatingBaseMenu";
import { AccessKnownRolesData$data } from "./__generated__/AccessKnownRolesData.graphql";
import CONFIG from "../config";



export type Acl = {
    readRoles: Set<string>;
    writeRoles: Set<string>;
};

type Action = "read" | "write";

type Option = {
    value: string;
    label: string;
}

type AclContext = {
    userIsRequired: boolean;
    acl: Acl;
    change: (f: (acl: Acl) => void) => void;
    knownGroups: KnownRoles;
    groupDag: GroupDag;
    largeGroups: Set<string>;
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
    const [groupAcl, userAcl] = splitAcl(acl);
    const change: AclContext["change"] = f => {
        const copy = {
            readRoles: new Set(acl.readRoles),
            writeRoles: new Set(acl.writeRoles),
        };
        f(copy);
        onChange(copy);
    };
    const customGroups: KnownRoles = Object.fromEntries(knownRoles.knownGroups.map(group => [
        group.role,
        i18n => group.label[i18n.language] ?? group.label.en ?? Object.values(group.label)[0],
    ]));
    const knownGroups = { ...BUILTIN_GROUPS, ...customGroups };
    const groupDag = buildDag(knownRoles.knownGroups);
    const largeGroups = new Set([
        ...BUILTIN_LARGE_GROUPS,
        ...knownRoles.knownGroups.filter(g => g.large).map(g => g.role),
    ]);

    const context = { userIsRequired, acl, change, knownGroups, groupDag, largeGroups };
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

    // Turn known roles into selectable options that react-select understands.
    const knownRoles = kind === "Group" ? knownGroups : KNOWN_USERS;
    const options = Object.entries(knownRoles)
        .map(([role, label]) => ({
            value: role,
            label: label(i18n),
        }));

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


    let selection: Option[] = [...new Set([...acl.readRoles, ...acl.writeRoles])]
        .map(role => ({
            value: role,
            label: getLabel(role, knownRoles, i18n),
        }));
    if (kind === "Group") {
        // Sort large groups to the top.
        selection = groupDag.sort(selection);
    } else {
        // Always show the current user first, if included. Then show all known
        // users, then all unknown ones, both in alphabetical order.
        const currentUserRole = getUserRole(user);
        const collator = new Intl.Collator(i18n.resolvedLanguage, { sensitivity: "base" });
        selection.sort((a, b) => {
            const section = (x: Option) => {
                if (x.value === currentUserRole) {
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

    const remove = (item: Option) => change(prev => {
        prev.readRoles.delete(item.value);
        prev.writeRoles.delete(item.value);
    });

    const handleCreate = (inputValue: string) => change(prev => {
        prev.readRoles.add(inputValue);
    });

    const handleChange = (choice: MultiValue<Option>) => change(prev => {
        choice
            .filter(option => !selection.includes(option))
            .forEach(option => prev.readRoles.add(option.value));
    });

    const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
        const clipboardData = event.clipboardData.getData("Text");

        if (kind === "User" && clipboardData.includes("\n")) {
            event.preventDefault();
            const names = clipboardData.split("\n").map(name => name.trim());

            const optionsToAdd: Option[] = names
                .map(name => options.filter(option => option.label === name)[0])
                .filter(option => option !== undefined);

            if (optionsToAdd.length > 0) {
                handleChange([...selection, ...optionsToAdd]);
                setMenuIsOpen(false);
            }
        }
    };


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
        <div onPaste={handlePaste}>
            <CreatableSelect
                onMenuOpen={() => setMenuIsOpen(true)}
                onMenuClose={() => setMenuIsOpen(false)}
                controlShouldRenderValue={false}
                isClearable={false}
                isMulti
                isSearchable
                placeholder={translations.placeholder}
                isValidNewOption={input => {
                    const validUserRole = isUserRole(input);
                    const validRole = /^ROLE_\w+/.test(input);
                    return kind === "Group" ? (validRole && !validUserRole) : validUserRole;
                }}
                formatCreateLabel={input => t("manage.access.select.create", { item: input })}
                noOptionsMessage={() => t("general.form.select.no-options")}
                value={selection}
                onCreateOption={handleCreate}
                backspaceRemovesValue={false}
                onChange={handleChange}
                styles={searchableSelectStyles(isDark)}
                css={{ marginTop: 6 }}
                {...{ theme, menuIsOpen, options }}
            />
        </div>
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
                    {selection.length === 0 && <tr>
                        <td colSpan={3} css={{ textAlign: "center", fontStyle: "italic" }}>
                            {t("acl.no-entries")}
                        </td>
                    </tr>}

                    {selection.map(item =>
                        <ListEntry key={item.label} {...{ remove, item, kind }} />)
                    }

                    {/*
                    The ACLs usually don't explicitly include admins, but showing that
                    entry makes sense if the user is admin.
                    */}
                    {(
                        kind === "Group"
                        && !selection.some(s => s.value === COMMON_ROLES.ADMIN)
                        && isRealUser(user)
                        && user.roles.includes(COMMON_ROLES.ADMIN)
                    ) && (
                        <ListEntry
                            item={{ label: t("acl.groups.admins"), value: COMMON_ROLES.ADMIN }}
                            remove={() => {}}
                            {...{ kind }}
                        />
                    )}
                </tbody>
            </table>
        </div>
    </div>;
};

type ItemProps = {
    item: Option;
    kind: RoleKind;
}

type ListEntryProps = ItemProps & {
    remove: (item: Option) => void;
}

const ListEntry: React.FC<ListEntryProps> = ({ remove, item, kind }) => {
    const user = useUser();
    const { t, i18n } = useTranslation();
    const { userIsRequired, acl, groupDag, knownGroups, largeGroups } = useAclContext();

    const canWrite = acl.writeRoles.has(item.value);
    const supersets = kind === "User" ? [] : groupDag
        .supersetsOf(item.value)
        .filter(role => acl.readRoles.has(role) && (!canWrite || acl.writeRoles.has(role)))
        .map(role => getLabel(role, knownGroups, i18n));
    const isSubset = supersets.length > 0;
    const isUser = item.value === getUserRole(user);

    let label: JSX.Element;
    if (isUser) {
        label = <span><i>{t("manage.access.table.yourself")}</i>&nbsp;({item.label})</span>;
    } else if (kind === "User" && isUserRole(item.label)) {
        // We strip the user role prefix (we take the longest prefix that
        // matches, though in almost all cases just a single one will match).
        // We then clean it a bit before displaying.
        const prefixes = CONFIG.auth.userRolePrefixes
            .filter(prefix => item.label.startsWith(prefix));
        const name = item.value.slice(Math.max(...prefixes.map(p => p.length)))
            .toLocaleLowerCase(i18n.resolvedLanguage)
            .replace("_", " ");
        label = <span>{name} (<i>{t("acl.unknown-user-note")}</i>)</span>;
    } else {
        label = <>{item.label}</>;
    }

    return (
        <tr key={item.label} css={{
            height: 44,
            ":hover, :focus-within": {
                td: { backgroundColor: COLORS.neutral15 },
            },
            ...isSubset && { color: COLORS.neutral60 },
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
                <span css={{ display: "flex" }}>
                    {label}
                    {isSubset && <Warning tooltip={
                        t("manage.access.table.subset-warning", { groups: supersets.join(", ") })
                    } />}
                </span>
            </td>
            <td>
                <div css={{
                    display: "flex",
                    "> div:first-of-type": { flex: "1" },
                    [screenWidthAtMost(480)]: {
                        lineHeight: 1,
                    },
                }}>
                    <ActionsMenu {...{ item, kind }} />
                    {largeGroups.has(item.value) && canWrite
                        ? <Warning tooltip={t("manage.access.table.actions.large-group-warning")} />
                        : <div css={{ width: 22 }} />
                    }
                </div>
            </td>
            <td>
                <ProtoButton
                    onClick={() => remove(item)}
                    disabled={item.value === COMMON_ROLES.ADMIN || userIsRequired && isUser}
                    css={{
                        marginLeft: "auto",
                        display: "flex",
                        color: COLORS.neutral60,
                        borderRadius: 4,
                        padding: 4,
                        ":hover, :focus-visible": { color: COLORS.danger0 },
                        ":disabled": { display: "none" },
                        ...focusStyle({ offset: -1 }),
                    }}
                >
                    <FiX size={20} />
                </ProtoButton>
            </td>
        </tr>
    );
};

type WarningProps = {
    tooltip: string;
}

const Warning: React.FC<WarningProps> = ({ tooltip }) => (
    <WithTooltip {...{ tooltip }} css={{ display: "flex" }}>
        <span css={{ marginLeft: 6, display: "flex" }}>
            <FiAlertTriangle css={{ color: COLORS.danger0, alignSelf: "center" }} />
        </span>
    </WithTooltip>
);


const ActionsMenu: React.FC<ItemProps> = ({ item, kind }) => {
    const isDark = useColorScheme().scheme === "dark";
    const ref = useRef<FloatingHandle>(null);
    const user = useUser();
    const { t } = useTranslation();
    const { userIsRequired, acl, change } = useAclContext();
    const [action, setAction] = useState<Action>(
        acl.writeRoles.has(item.value) ? "write" : "read"
    );

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


    return [COMMON_ROLES.ADMIN, COMMON_ROLES.USER_ADMIN].includes(item.value)
            || userIsRequired && item.value === getUserRole(user)
        ? <span css={{ marginLeft: 8 }}>{t("manage.access.table.actions.write")}</span>
        : <FloatingBaseMenu
            ref={ref}
            label={t("manage.access.table.actions.title")}
            triggerContent={<>{translations(action).label}</>}
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
                        {actions.map(actionType => <ActionMenuItem
                            key={actionType}
                            disabled={actionType === action}
                            label={translations(actionType).label}
                            description={translations(actionType).description}
                            onClick={() => {
                                setAction(actionType);
                                change(prev => {
                                    if (actionType === "write") {
                                        prev.writeRoles.add(item.value);
                                    } else {
                                        prev.writeRoles.delete(item.value);
                                    }
                                });
                            }}
                            close={() => ref.current?.close()}
                        />)}
                    </ul>
                </Floating>
            }
        />;
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

/** Returns a label for the role, if known to Tobira. */
const getLabel = (role: string, knownRoles: KnownRoles, i18n: i18n) => {
    if (role === COMMON_ROLES.USER_ADMIN) {
        return i18n.t("acl.admin-user");
    }
    return knownRoles[role]?.(i18n) ?? role;
};

const isUserRole = (role: string) =>
    CONFIG.auth.userRolePrefixes.some(prefix => role.startsWith(prefix));

/** Splits initial ACL into group and user roles. */
const splitAcl = (initialAcl: Acl) => {
    const groupAcl: Acl = {
        readRoles: new Set([...initialAcl.readRoles].filter(role => !isUserRole(role))),
        writeRoles: new Set([...initialAcl.writeRoles].filter(role => !isUserRole(role))),
    };
    const userAcl: Acl = {
        readRoles: new Set([...initialAcl.readRoles].filter(role => isUserRole(role))),
        writeRoles: new Set([...initialAcl.writeRoles].filter(role => isUserRole(role))),
    };

    return [groupAcl, userAcl];
};


export const getUserRole = (user: UserState) => {
    const userRole = isRealUser(user) && user.roles.find(isUserRole);
    return typeof userRole !== "string" ? "Unknown" : userRole;
};



// ==============================================================================================
// ===== Known groups & users
// ==============================================================================================

type KnownRoles = Record<string, (i18n: i18n) => string>;

const BUILTIN_GROUPS: KnownRoles = {
    ROLE_ANONYMOUS: (i18n: i18n) => i18n.t("acl.groups.everyone"),
    ROLE_USER: (i18n: i18n) => i18n.t("acl.groups.logged-in-users"),
};

const DUMMY_USERS: KnownRoles = {
    ROLE_USER_SABINE: () => "Sabine Rudolfs",
    ROLE_USER_BJÖRK: () => "Prof. Björk Guðmundsdóttir",
    ROLE_USER_MORGAN: () => "Morgan Yu",
    ROLE_USER_JOSE: () => "José Carreño Quiñones",
};

const KNOWN_USERS: KnownRoles = DUMMY_USERS;

const BUILTIN_LARGE_GROUPS = [COMMON_ROLES.USER, COMMON_ROLES.ANONYMOUS];


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
    sort(groups: Option[]): Option[];
}

const buildDag = (customGroups: AccessKnownRolesData$data["knownGroups"]): GroupDag => {
    const vertices = new Map<string, Set<string>>();
    vertices.set(COMMON_ROLES.ANONYMOUS, new Set());
    vertices.set(COMMON_ROLES.USER, new Set([COMMON_ROLES.ANONYMOUS]));

    for (const { role, implies } of customGroups) {
        vertices.set(role, new Set([COMMON_ROLES.USER, ...implies]));
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

                const option = options.find(o => o.value === candidate);
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
                if (!visited.has(option.value)) {
                    out.push(option);
                }
            }

            return out;
        },
    };
};
