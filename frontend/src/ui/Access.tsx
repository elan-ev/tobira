import {
    useColorScheme,
    match,
    ProtoButton,
    WithTooltip,
    FloatingHandle,
    Floating,
    bug,
    notNullish,
} from "@opencast/appkit";
import {
    createContext,
    useRef,
    useState,
    useContext,
    Dispatch,
    SetStateAction,
} from "react";
import { useTranslation } from "react-i18next";
import { FiX, FiAlertTriangle } from "react-icons/fi";
import { MultiValue } from "react-select";
import CreatableSelect from "react-select/creatable";
import { i18n } from "i18next";

import { focusStyle } from ".";
import { useUser, isRealUser, UserState } from "../User";
import { COLORS } from "../color";
import { COMMON_ROLES } from "../util/roles";
import { SelectProps } from "./Input";
import { searchableSelectStyles, theme } from "./SearchableSelect";
import { FloatingBaseMenu } from "./FloatingBaseMenu";



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
    onChange: Dispatch<SetStateAction<Acl>>;
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
    onChange: Dispatch<SetStateAction<Acl>>;
}

export const AclSelector: React.FC<AclSelectorProps> = (
    { acl, userIsRequired = false, onChange }
) => {
    const [groupAcl, userAcl] = splitAcl(acl);

    return <AclContext.Provider value={{ userIsRequired, acl, onChange }}>
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

type AclSelectProps = SelectProps & {
    acl: Acl;
    kind: RoleKind;
};

/** One of the two columns for either users or groups. */
const AclSelect: React.FC<AclSelectProps> = ({ acl, kind }) => {
    const isDark = useColorScheme().scheme === "dark";
    const user = useUser();
    const { t, i18n } = useTranslation();
    const { onChange } = useAclContext();
    const [menuIsOpen, setMenuIsOpen] = useState<boolean>(false);

    // Turn known roles into selectable options that react-select understands.
    const options = Object.entries(knownRoles(kind))
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


    let selection: Option[] = makeSelection(acl, kind, i18n);
    if (kind === "Group") {
        // Sort large groups to the top.
        selection = groupDAG().sort(selection);
    } else {
        // Always show the current user first, if included. Otherwise show
        // entries in order of addition.
        const currentUserRole = getUserRole(user);
        selection.sort((a, b) => {
            const an = a.value === currentUserRole ? 0 : 1;
            const bn = b.value === currentUserRole ? 0 : 1;
            return an - bn;
        });
    }

    // The ACL might not explicitly include admin, but since we still want to show
    // the admin entry when logged in as admin, the item needs to be added manually.
    if (kind === "Group" && !selection.some(s => s.value === COMMON_ROLES.ADMIN)) {
        selection.push({
            label: t("acl.groups.admins"),
            value: COMMON_ROLES.ADMIN,
        });
    }


    const remove = (item: Option) => {
        onChange(prev => {
            prev.readRoles.delete(item.value);
            prev.writeRoles.delete(item.value);
            return {
                readRoles: new Set(prev.readRoles),
                writeRoles: new Set(prev.writeRoles),
            };
        });
    };

    const handleCreate = (inputValue: string) => {
        onChange(prev => {
            prev.readRoles.add(inputValue);
            return {
                ...prev,
                readRoles: new Set(prev.readRoles),
            };
        });
    };

    const handleChange = (choice: MultiValue<Option>) => {
        const newRoles = choice
            .filter(option => !selection.includes(option))
            .map(option => option.value);

        onChange(prev => {
            for (const role of newRoles) {
                prev.readRoles.add(role);
            }
            return {
                ...prev,
                readRoles: new Set(prev.readRoles),
            };
        });
    };

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
        minWidth: 420,
        display: "flex",
        flexDirection: "column",
        maxWidth: 700,
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
                isValidNewOption={input => kind === "Group" && /^ROLE_\w+/.test(input)}
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
                    textAlign: "left",
                    padding: 6,
                    ":first-of-type": {
                        paddingLeft: 12,
                    },
                },
            }}>
                <colgroup>
                    <col css={{ }} />
                    <col css={{ width: i18n.resolvedLanguage === "en" ? 190 : 224 }} />
                    <col css={{ width: 42 }} />
                </colgroup>
                <thead>
                    <tr css={{ borderBottom: `2px solid ${COLORS.neutral05}` }}>
                        <th>{translations.columnHeader}</th>
                        <th>{t("manage.access.table.actions.title")}</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {selection.map(item =>
                        <ListEntry key={item.label} {...{ remove, item, kind }} />)
                    }
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
    const { userIsRequired, acl } = useAclContext();

    const supersets = kind === "Group" ? supersetList(item.value, acl, i18n) : [];
    const isSubset = supersets.length > 0;
    const isAdmin = [COMMON_ROLES.ADMIN, COMMON_ROLES.USER_ADMIN].includes(item.value);
    const isUser = item.value === getUserRole(user);

    return isAdmin && isRealUser(user) && !user.roles.includes(COMMON_ROLES.ADMIN)
        ? null
        : <tr key={item.label} css={{
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
                    {isUser || item.value === COMMON_ROLES.USER_ADMIN
                        ? <><i>{t("manage.access.table.yourself")}</i>&nbsp;({item.label})</>
                        : <>{item.label}</>
                    }
                    {isSubset
                        ? <Warning tooltip={t("manage.access.table.subset-warning",
                            { groups: supersets.join(", ") })} />
                        : <div css={{ width: 22 }} />
                    }
                </span>
            </td>
            <td>
                <div css={{ display: "flex", "> div:first-of-type": { flex: "1" } }}>
                    <ActionsMenu {...{ item, kind }} />
                    {LARGE_GROUPS.includes(item.value)
                        && acl.writeRoles.has(item.value)
                        ? <Warning tooltip={t("manage.access.table.actions.large-group-warning")} />
                        : <div css={{ width: 22 }} />
                    }
                </div>
            </td>
            <td>
                <ProtoButton
                    onClick={() => remove(item)}
                    disabled={isAdmin || userIsRequired && isUser}
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
        </tr>;
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
    const { userIsRequired, acl, onChange } = useAclContext();
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
                                onChange(prev => {
                                    if (actionType === "write") {
                                        prev.writeRoles.add(item.value);
                                    } else {
                                        prev.writeRoles.delete(item.value);
                                    }
                                    return {
                                        ...prev,
                                        writeRoles: new Set(prev.writeRoles),
                                    };
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

/**
 * Returns the labels of every other selected group whose subset includes the role
 * of the selection and also has the same read/write (or a subset of write) access level.
 */
const supersetList = (subsetRole: string, { readRoles, writeRoles }: Acl, i18n: i18n) => {
    const isReadOnly = !writeRoles.has(subsetRole);
    return groupDAG()
        .supersetsOf(subsetRole)
        .filter(superset => readRoles.has(superset) && (isReadOnly || writeRoles.has(superset)))
        .map(superset => getLabel(superset, "Group", i18n));
};


/** Returns a label for the role, if known to Tobira. */
const getLabel = (role: string, kind: RoleKind, i18n: i18n) => {
    // First try whether we know about the role.
    const known = knownRoles(kind);
    if (role in known) {
        return known[role](i18n);
    }

    // If it's a user role, we strip the `ROLE_USER_` and format it kind of
    // nicely.
    if (kind === "User" && role.startsWith("ROLE_USER_")) {
        const name = role.slice("ROLE_USER_".length).toLowerCase();
        return name.charAt(0).toUpperCase() + name.slice(1);
    }

    return role;
};

/** Takes an initial ACL and formats it as options for react-select that are already selected. */
const makeSelection = (acl: Acl, kind: RoleKind, i18n: i18n): Option[] => {
    const aclArray = [...new Set([...acl.readRoles, ...acl.writeRoles])];

    return aclArray.map(role => ({
        value: role,
        label: getLabel(role, kind, i18n),
    }));
};


/** Splits initial ACL into group and user roles. */
const splitAcl = (initialAcl: Acl) => {
    const regEx = /^ROLE_USER_\w+/;
    const groupAcl: Acl = {
        readRoles: new Set([...initialAcl.readRoles].filter(role => !regEx.test(role))),
        writeRoles: new Set([...initialAcl.writeRoles].filter(role => !regEx.test(role))),
    };
    const userAcl: Acl = {
        readRoles: new Set([...initialAcl.readRoles].filter(role => regEx.test(role))),
        writeRoles: new Set([...initialAcl.writeRoles].filter(role => regEx.test(role))),
    };

    return [groupAcl, userAcl];
};


export const getUserRole = (user: UserState) => {
    const userRole = isRealUser(user) && user.roles.find(role => /^ROLE_USER\w+/.test(role));
    return typeof userRole !== "string" ? "Unknown" : userRole;
};



// ==============================================================================================
// ===== Known groups & users
// ==============================================================================================

type KnownRoles = Record<string, (i18n: i18n) => string>;

const BUILTIN_GROUPS: KnownRoles = {
    // TODO: list all possible groups (also from Opencast?).
    // TODO: read mappings from config.
    ROLE_ANONYMOUS: (i18n: i18n) => i18n.t("acl.groups.everyone"),
    ROLE_USER: (i18n: i18n) => i18n.t("acl.groups.logged-in-users"),
    ROLE_TOBIRA_MODERATOR: (i18n: i18n) => i18n.t("acl.groups.moderators"),
    ROLE_TOBIRA_STUDIO: (i18n: i18n) => i18n.t("acl.groups.studio-users"),
    ROLE_TOBIRA_EDITOR: (i18n: i18n) => i18n.t("acl.groups.editors"),
};

const DUMMY_USERS: KnownRoles = {
    ROLE_USER_SABINE: () => "Sabine Rudolfs",
    ROLE_USER_BJÖRK: () => "Prof. Björk Guðmundsdóttir",
    ROLE_USER_MORGAN: () => "Morgan Yu",
    ROLE_USER_JOSE: () => "José Carreño Quiñones",
};

const KNOWN_GROUPS: KnownRoles = BUILTIN_GROUPS;
const KNOWN_USERS: KnownRoles = DUMMY_USERS;

const LARGE_GROUPS = [COMMON_ROLES.USER, COMMON_ROLES.ANONYMOUS];

const knownRoles = (kind: RoleKind) => match(kind, {
    Group: () => KNOWN_GROUPS,
    User: () => KNOWN_USERS,
});


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

const groupDAG: () => GroupDag = (() => {
    let instance: GroupDag | null = null;
    return () => {
        if (!instance) {
            instance = buildDag();
        }

        return instance;
    };
})();

const buildDag = (): GroupDag => {
    const vertices = new Map<string, Set<string>>();

    for (const groupRole of Object.keys(KNOWN_GROUPS)) {
        let supersets: Set<string>;

        if (groupRole === COMMON_ROLES.ANONYMOUS) {
            supersets = new Set();
        } else if (groupRole === COMMON_ROLES.USER) {
            supersets = new Set([COMMON_ROLES.ANONYMOUS]);
        } else {
            // TODO: add configurable relationships
            supersets = new Set([COMMON_ROLES.USER]);
        }

        vertices.set(groupRole, supersets);
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
