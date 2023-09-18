import {
    useColorScheme,
    match,
    ProtoButton,
    WithTooltip,
    FloatingHandle,
    Floating,
} from "@opencast/appkit";
import {
    createContext,
    useRef,
    useState,
    useContext,
    Dispatch,
    SetStateAction,
    useEffect,
} from "react";
import { useTranslation } from "react-i18next";
import { FiX, FiAlertTriangle } from "react-icons/fi";
import { MultiValue } from "react-select";
import CreatableSelect from "react-select/creatable";
import { focusStyle } from ".";
import { useUser, isRealUser, UserState } from "../User";
import { COLORS } from "../color";
import i18n from "../i18n";
import {
    DUMMY_GROUPS,
    DUMMY_USERS,
    SUBSET_RELATIONS,
    LARGE_GROUPS,
} from "../routes/manage/Video/dummyData";
import { COMMON_ROLES } from "../util/roles";
import { SelectProps } from "./Input";
import { searchableSelectStyles, theme } from "./SearchableSelect";
import { FloatingBaseMenu } from "./FloatingBaseMenu";

export type Acl = {
    readRoles: string[];
    writeRoles: string[];
};

export type AclRecord = Record<string, { label: string; roles: string[] }>

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

const useAclContext = () => {
    const aclContext = useContext(AclContext);
    if (!aclContext) {
        throw new Error("Error: Acl context is not initialized!");
    }
    return aclContext;
};

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
    const groupOptions = makeOptions(DUMMY_GROUPS);
    const userOptions = makeOptions(DUMMY_USERS);

    const [groupAcl, userAcl] = splitAcl(acl);

    return <AclContext.Provider value={{ userIsRequired, acl, onChange }}>
        <div css={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 24,
        }}>
            <AclSelect
                kind="Group"
                initialAcl={groupAcl}
                allOptions={groupOptions}
            />
            <AclSelect
                kind="User"
                initialAcl={userAcl}
                allOptions={userOptions}
            />
        </div>
    </AclContext.Provider>;
};

type AclKind = "Group" | "User";

type AclSelectProps = SelectProps & {
    initialAcl: Acl;
    allOptions: Option[];
    kind: AclKind;
};

const defaultDummyOption: Option = {
    value: COMMON_ROLES.ADMIN,
    label: "Administrator",
};

const AclSelect: React.FC<AclSelectProps> = ({ initialAcl, allOptions, kind }) => {
    const isDark = useColorScheme().scheme === "dark";
    const user = useUser();
    const { t } = useTranslation();
    const { acl, onChange } = useAclContext();
    const [menuIsOpen, setMenuIsOpen] = useState<boolean>(false);

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

    const isSubset = (role: string, potentialSuperset: string): boolean => {
        const relation = SUBSET_RELATIONS.find(entry => entry.superset === potentialSuperset);
        if (relation) {
            return relation.subsets.includes(role)
                    || relation.subsets.some(subset => isSubset(role, subset));
        }
        return false;
    };

    const roleComparator = (a: Option, b: Option) => {
        if (kind === "Group") {
            // Sort ACL group entries by their scope,
            // so that supersets will be shown before subsets.

            // A is a subset of b, so b should come first.
            if (isSubset(a.value, b.value)) {
                return 1;
            }
            // B is a subset of a, so a should come first.
            if (isSubset(b.value, a.value)) {
                return -1;
            }
            // Neither is a subset of the other, don't sort.
            return 0;
        } else {
            // Always show the current user first, if included.
            if (a.value === getUserRole(user)) {
                return -1;
            }
            if (b.value === getUserRole(user)) {
                return 1;
            }
            // Otherwise show entries in order of addition.
            return 0;
        }
    };

    const initialSelections: Option[] = makeSelection(
        kind === "Group" ? DUMMY_GROUPS : DUMMY_USERS, initialAcl
    ).sort((roleComparator));

    const initialOptions = allOptions.filter(
        item => !initialSelections.some(elem => elem.value === item.value)
    );

    // The ACL might not explicitly include admin, but since we still want to show
    // the admin entry when logged in as admin, the item needs to be added manually.
    if (kind === "User" && !initialSelections.some(
        selection => selection.label === "Administrator"
    )) {
        initialSelections.splice(0, 0, defaultDummyOption);
    }

    const [selection, setSelection] = useState<MultiValue<Option>>(initialSelections);
    const [options, setOptions] = useState<MultiValue<Option>>(initialOptions);

    useEffect(() => {
        setSelection(initialSelections);
        setOptions(initialOptions);
    }, [acl]);

    const remove = (item: Option) => {
        const filterItem = (items: MultiValue<Option>) => items.filter(
            option => option.value !== item.value
        );

        setSelection(prev => filterItem(prev));
        setOptions(prev => allOptions.some(option => option.value === item.value)
            ? allOptions.filter(entry => !filterItem(selection)
                .some(option => entry.value === option.value))
            : [...prev, item]);

        onChange({
            readRoles: acl.readRoles.filter(role => item.value !== role),
            writeRoles: acl.writeRoles.filter(role => item.value !== role),
        });
    };

    const handleCreate = (inputValue: string) => {
        if (!inputValue.startsWith("ROLE_")) {
            return;
        }
        const newRole: Option = {
            value: inputValue,
            label: formatUnknownRole(inputValue),
        };
        setSelection(prev => [...prev, newRole]);

        onChange({
            ...acl,
            readRoles: [...acl.readRoles, inputValue],
        });
    };

    const handleChange = (choice: MultiValue<Option>) => {
        const newRoles = choice
            .filter(option => !selection.includes(option))
            .map(option => option.value);

        setSelection([...choice].sort(roleComparator));
        setOptions(prev => prev.filter(
            option => !choice.some(opt => opt.value === option.value)
        ));
        onChange({
            ...acl,
            readRoles: [...acl.readRoles, ...newRoles],
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
        flex: "1 1 320px",
        display: "flex",
        flexDirection: "column",
        maxWidth: 900,
    }}>
        <h4>{translations.heading}</h4>
        <div onPaste={handlePaste}>
            <CreatableSelect
                onMenuOpen={() => setMenuIsOpen(true)}
                onMenuClose={() => setMenuIsOpen(false)}
                controlShouldRenderValue={false}
                isClearable={false}
                isMulti
                isSearchable
                placeholder={translations.placeholder}
                formatCreateLabel={input => kind === "Group"
                    && /^ROLE_\w+/.test(input)
                    && t("manage.access.select.create", { item: input })
                }
                value={selection}
                onCreateOption={handleCreate}
                filterOption={(option, inputValue) => !!option.label
                        && option.label.toLowerCase().includes(inputValue.toLowerCase())
                }
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
                tableLayout: "auto",
                width: "100%",
                borderRadius: 4,
                borderCollapse: "collapse",
                backgroundColor: COLORS.neutral10,
                "th, td": {
                    textAlign: "left",
                    padding: "6px 12px",
                },
            }}>
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
    kind: AclKind;
}

type ListEntryProps = ItemProps & {
    remove: (item: Option) => void;
}

const ListEntry: React.FC<ListEntryProps> = ({ remove, item, kind }) => {
    const user = useUser();
    const { t } = useTranslation();
    const { userIsRequired, acl } = useAclContext();

    const supersets = kind === "Group" ? supersetList(item.value, acl) : [];
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
                    {isUser || isAdmin
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
                <span css={{ display: "flex" }}>
                    <ActionsMenu {...{ item, kind }} />
                    {LARGE_GROUPS.includes(item.value)
                        && acl.writeRoles.includes(item.value)
                        ? <Warning tooltip={t("manage.access.table.actions.large-group-warning")} />
                        : <div css={{ width: 22 }} />
                    }
                </span>
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
        acl.writeRoles.includes(item.value) ? "write" : "read"
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
                width: i18n.resolvedLanguage === "en" ? 150 : 190,
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
                                onChange({
                                    ...acl,
                                    writeRoles: actionType === "write"
                                        ? [...acl.writeRoles, item.value]
                                        : acl.writeRoles.filter(
                                            role => role !== item.value
                                        ),
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
const supersetList = (subsetRole: string, selections: Acl) => {
    const hasReadOnly = (role: string) => selections.readRoles.includes(role)
        && !selections.writeRoles.includes(role);
    const hasReadOrWrite = (role: string) => selections.readRoles.includes(role)
        || selections.writeRoles.includes(role);

    return SUBSET_RELATIONS
        // Role is valid subset.
        .filter(relation => relation.subsets.includes(subsetRole))
        .filter(relation =>
            // Superset has write access and the subset has read or write access, or...
            (selections.writeRoles.includes(relation.superset) && hasReadOrWrite(subsetRole))
            // Superset has read or write access and subset has read access only.
            || (hasReadOrWrite(relation.superset) && hasReadOnly(subsetRole)))
        .map(relation => getLabel(DUMMY_GROUPS, relation.superset));
};


/** Returns a label for the role, if known to Tobira. */
const getLabel = (record: AclRecord, role: string) => {
    const name = Object.values(record).filter(entry => entry.roles.includes(role));

    return name.length === 1 ? name[0].label : formatUnknownRole(role);
};

const formatUnknownRole = (role: string) => {
    for (const prefix of ["ROLE_USER_", "ROLE_GROUP_", "ROLE_"]) {
        if (role.startsWith(prefix)) {
            const name = role.replace(prefix, "").toLowerCase();
            return name.charAt(0).toUpperCase() + name.slice(1);
        }
    }

    return role;
};

/** Takes an initial ACL and formats it as options for react-select that are already selected. */
const makeSelection = (record: AclRecord, acl: Acl): Option[] => {
    const aclArray = [...new Set(acl.readRoles.concat(acl.writeRoles))];

    return aclArray.map(role => ({
        value: role,
        label: getLabel(record, role),
    }));
};

/** Takes a record of all possible roles and formats them as options for react-select. */
const makeOptions = (record: AclRecord): Option[] =>
    Object.values(record).filter(entry => entry.label !== "Administrator").map(entry => ({
        value: entry.roles.length > 1
            // User role. If the array does not contain a user role, return the first role instead.
            ? entry.roles.find(role => /^ROLE_USER\w+/.test(role)) ?? entry.roles[0]
            // Group role.
            : entry.roles[0],
        label: entry.label,
    }));

/** Splits initial ACL into group and user roles. */
const splitAcl = (initialAcl: Acl) => {
    const regEx = /^ROLE_USER_\w+/;
    const groupAcl: Acl = {
        readRoles: initialAcl.readRoles.filter(role => !regEx.test(role)),
        writeRoles: initialAcl.writeRoles.filter(role => !regEx.test(role)),
    };
    const userAcl: Acl = {
        readRoles: initialAcl.readRoles.filter(role => regEx.test(role)),
        writeRoles: initialAcl.writeRoles.filter(role => regEx.test(role)),
    };

    return [groupAcl, userAcl];
};


export const getUserRole = (user: UserState) => {
    const userRole = isRealUser(user) && user.roles.find(role => /^ROLE_USER\w+/.test(role));
    return typeof userRole !== "string" ? "Unknown" : userRole;
};

