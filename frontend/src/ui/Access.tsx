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
    forwardRef,
    useRef,
    useImperativeHandle,
    Dispatch,
    SetStateAction,
    useState,
    useContext,
    useEffect,
    RefObject,
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
    value: {
        roles: string[];
        action: Action;
    };
    label: string;
}

type AclSelectorProps = {
    initialAcl: Acl;
    /**
     * If `true`, the current user is included by default with `write` access and can't be removed.
     * This is necessary for the acl-selection in the uploader.
     */
    userRequired?: boolean;
}

export type AclSelectorHandle = {
    selections: () => Acl;
    reset?: () => void;
};

const UserRequiredContext = createContext<boolean>(false);

export const AclSelector = forwardRef<AclSelectorHandle, AclSelectorProps>(
    ({ initialAcl, userRequired = false }, ref) => {
        const groupsRef = useRef<AclSelectHandle>(null);
        const usersRef = useRef<AclSelectHandle>(null);

        const groupOptions = makeOptions(DUMMY_GROUPS);
        const userOptions = makeOptions(DUMMY_USERS);

        const [initialGroupAcl, initialUserAcl] = splitAcl(initialAcl);

        useImperativeHandle(ref, () => ({
            selections: () => getSelections({ groupsRef, usersRef }),
            reset: () => {
                groupsRef.current?.reset();
                usersRef.current?.reset();
            },
        }));

        return <div css={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 24,
        }}>
            <AclSelect
                ref={groupsRef}
                kind="Group"
                initialAcl={initialGroupAcl}
                allOptions={groupOptions}
            />
            <UserRequiredContext.Provider value={userRequired}>
                <AclSelect
                    ref={usersRef}
                    kind="User"
                    initialAcl={initialUserAcl}
                    allOptions={userOptions}
                />
            </UserRequiredContext.Provider>
        </div>;
    }
);


type AclSelectProps = SelectProps & {
    initialAcl: Acl;
    allOptions: Option[];
    kind: "Group" | "User";
};

type AclSelectHandle = {
    getSelection: () => MultiValue<Option>;
    reset: () => void;
};

type SelectionContext = {
    selection: MultiValue<Option>;
    setSelection: Dispatch<SetStateAction<MultiValue<Option>>>;
    item: Option;
    kind: "User" | "Group";
};

const defaultDummyOption: Option = {
    value: {
        roles: [COMMON_ROLES.ROLE_ADMIN, "ROLE_USER_ADMIN"],
        action: "write",
    },
    label: "Administrator",
};

const SelectionContext = createContext<SelectionContext>({
    selection: [defaultDummyOption],
    setSelection: () => {},
    item: defaultDummyOption,
    kind: "User",
});

const AclSelect = forwardRef<AclSelectHandle, AclSelectProps>(
    ({ initialAcl, allOptions, kind }, ref) => {
        const [menuIsOpen, setMenuIsOpen] = useState<boolean>(false);
        const isDark = useColorScheme().scheme === "dark";
        const { t } = useTranslation();

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

        // Sorts ACL entries by their scope, i.e. supersets will be shown before subsets.
        const roleComparator = (a: Option, b: Option) =>
            Number(SUBSET_RELATIONS.some(set => set.superset === b.value.roles[0]))
                - Number(SUBSET_RELATIONS.some(set => set.superset === a.value.roles[0]));

        const initialSelections: Option[] = makeSelection(
            kind === "Group" ? DUMMY_GROUPS : DUMMY_USERS, initialAcl
        ).sort((roleComparator));

        const initialOptions = allOptions.filter(
            item => !initialSelections.some(elem => elem.value.roles === item.value.roles)
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

        const [_supersets, setSupersets] = useState<MultiValue<Option>>(
            selection.filter(item => supersetList(item, selection).length > 0)
        );

        useImperativeHandle(ref, () => ({
            getSelection: () => selection,
            reset: () => {
                setSelection(initialSelections);
                setOptions(initialOptions);
            },
        }));


        const remove = (item: Option) => {
            const filterItem = (items: MultiValue<Option>) => items.filter(
                option => option.value !== item.value
            );

            setSelection(prev => filterItem(prev));
            setOptions(prev => allOptions.some(option => option.value.roles === item.value.roles)
                ? allOptions.filter(entry => !filterItem(selection)
                    .some(option => entry.value.roles === option.value.roles))
                : [...prev, item]);
        };

        const handleCreate = (inputValue: string) => {
            if (!inputValue.startsWith("ROLE_")) {
                return;
            }
            const newRole: Option = {
                value: {
                    roles: [inputValue],
                    action: "read",
                },
                label: inputValue,
            };
            setSelection(prev => [...prev, newRole]);
        };

        const handleChange = (choice: MultiValue<Option>) => {
            setSelection(prev => {
                const newItem = choice.filter(option => !prev.includes(option));
                newItem[0].value.action = "read";
                return [...choice].sort(roleComparator);
            });

            setOptions(prev => prev.filter(
                option => !choice.some(opt => opt.value.roles === option.value.roles)
            ));
        };

        const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
            event.preventDefault();

            if (kind === "User") {
                const clipboardData = event.clipboardData.getData("Text");
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
                    formatCreateLabel={input =>
                        /^ROLE_\w+/.test(input) && t("manage.access.select.create", { item: input })
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
                            <SelectionContext.Provider
                                value={{ selection, setSelection, item, kind }}
                                key={item.label}
                            >
                                <ListEntry {...{ remove, setSupersets, kind }} />
                            </SelectionContext.Provider>)
                        }
                    </tbody>
                </table>
            </div>
        </div>;
    }
);


type ListEntryProps = {
    setSupersets: Dispatch<SetStateAction<MultiValue<Option>>>;
    remove: (item: Option) => void;
}

const ListEntry: React.FC<ListEntryProps> = (
    { remove, setSupersets }
) => {
    const { t } = useTranslation();
    const user = useUser();
    const { selection, item } = useContext(SelectionContext);
    const userIsRequired = useContext(UserRequiredContext);
    const isSubset = supersetList(item, selection).length > 0;
    const supersets = supersetList(item, selection).map(set => set.label).join(", ");
    const isAdminItem = item.value.roles.includes(COMMON_ROLES.ROLE_ADMIN);
    const isUser = item.value.roles.includes(getUserRole(user));

    return isAdminItem && isRealUser(user) && !user.roles.includes(COMMON_ROLES.ROLE_ADMIN)
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
                    {isUser
                        ? <><i>{t("manage.access.table.yourself")}</i>&nbsp;({item.label})</>
                        : <>{item.label}</>
                    }
                    {isSubset
                        ? <Warning tooltip={
                            t("manage.access.table.subset-warning", { groups: supersets })
                        } />
                        : <div css={{ width: 22 }} />
                    }
                </span>
            </td>
            <td>
                <span css={{ display: "flex" }}>
                    <ActionsMenu
                        updateStates={() => setSupersets(selection.filter(item =>
                            supersetList(item, selection).length > 0))
                        }
                    />
                    {LARGE_GROUPS.includes(item.value.roles[0]) && item.value.action === "write"
                        ? <Warning tooltip={t("manage.access.table.actions.large-group-warning")} />
                        : <div css={{ width: 22 }} />
                    }
                </span>
            </td>
            <td>
                <ProtoButton
                    onClick={() => remove(item)}
                    disabled={isAdminItem || userIsRequired && isUser}
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
    <WithTooltip
        {...{ tooltip }}
        css={{ display: "flex" }}
    >
        <span css={{ marginLeft: 6, display: "flex" }}>
            <FiAlertTriangle css={{ color: COLORS.danger0, alignSelf: "center" }} />
        </span>
    </WithTooltip>
);


type ActionsMenuProps = {
    updateStates: () => void;
}

const ActionsMenu: React.FC<ActionsMenuProps> = (
    { updateStates }
) => {
    const ref = useRef<FloatingHandle>(null);
    const isDark = useColorScheme().scheme === "dark";
    const { t } = useTranslation();
    const userIsRequired = useContext(UserRequiredContext);
    const { setSelection, item, kind } = useContext(SelectionContext);
    const user = useUser();
    const actions: Action[] = ["read", "write"];
    const [action, setAction] = useState<Action>(item.value.action);

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

    useEffect(() => {
        updateStates();
    }, [action]);

    const language = i18n.resolvedLanguage;

    return item.value.roles.includes(COMMON_ROLES.ROLE_ADMIN)
            || userIsRequired && item.value.roles.includes(getUserRole(user))
        ? <span css={{ marginLeft: 8 }}>{t("manage.access.table.actions.write")}</span>
        : <FloatingBaseMenu
            ref={ref}
            label={t("manage.access.table.actions.title")}
            triggerContent={<>{translations(action).label}</>}
            triggerStyles={{
                width: language === "en" ? 150 : 190,
                gap: 0,
                padding: "0 4px 0 8px",
                justifyContent: "space-between",
                ":hover, :focus-visible": {
                    backgroundColor: COLORS.neutral20,
                },
                svg: { marginTop: 2, color: COLORS.neutral60 },
            }}
            list={
                <Floating
                    backgroundColor={isDark ? COLORS.neutral15 : COLORS.neutral05}
                    hideArrowTip
                    padding={0}
                    borderWidth={isDark ? 1 : 0}
                    css={{ minWidth: 125 }}
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
                                setSelection(prev => {
                                    const index = prev.findIndex(
                                        entry => entry.value === item.value
                                    );

                                    prev[index].value.action = actionType;
                                    return prev;
                                });
                                updateStates();
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

// Returns every other group that is selected and whose subset includes the role of
// the selection and also has the same read/write (or a subset of write) access level.
const supersetList = (selection: Option, selectedGroups: MultiValue<Option>) => {
    const roleToCheck = selection.value.roles[0];

    const supersets = selectedGroups
        .filter(group =>
            SUBSET_RELATIONS.some(
                set => set.superset === group.value.roles[0] && set.subsets.includes(roleToCheck)
            ) && (
                group.value.action === selection.value.action || group.value.action === "write"
            ));

    return supersets;
};


const getLabel = (
    record: AclRecord,
    role: string,
) => {
    const name = Object.values(record).filter(entry => entry.roles.includes(role));

    return name.length === 1
        ? name[0].label
        : formatUnknownRole(role);
};

const formatUnknownRole = (role: string) => {
    for (const prefix of ["ROLE_USER_", "ROLE_GROUP_"]) {
        if (role.startsWith(prefix)) {
            const name = role.replace(prefix, "").toLowerCase();
            return name.charAt(0).toUpperCase() + name.slice(1);
        }
    }

    return role;
};

const getAction = (acl: Acl, role: string): Action => {
    if (acl.readRoles.includes(role) && acl.writeRoles.includes(role)) {
        return "write";
    }
    return "read";
};

// Takes an initial ACL and formats it as options for react-select
// that are already selected with their respective action.
const makeSelection = (record: AclRecord, acl: Acl): Option[] => {
    const aclArray = [...new Set(acl.readRoles.concat(acl.writeRoles))];
    return aclArray.map(role => {
        const roles = Object.values(record)
            .find(entry => entry.roles.includes(role))
            ?.roles ?? [role];

        return {
            value: {
                roles: roles,
                action: getAction(acl, role),
            },
            label: getLabel(record, role),
        };
    });
};

// Takes a record of all possible roles and formats them as options for react-select
// with the default "write" action.
const makeOptions = (record: AclRecord): Option[] =>
    Object.values(record).filter(entry => entry.label !== "Administrator").map(entry => ({
        value: {
            roles: entry.roles,
            action: "read",
        },
        label: entry.label,
    }));

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


type SelectionsProps = {
    groupsRef: RefObject<AclSelectHandle>;
    usersRef: RefObject<AclSelectHandle>;
}

// Collects group and user selections and prepares them for submittal.
const getSelections = ({ groupsRef, usersRef }: SelectionsProps): Acl => {
    const selectedGroups = groupsRef.current?.getSelection();
    const selectedUsers = usersRef.current?.getSelection();

    assertUndefined(selectedGroups);
    assertUndefined(selectedUsers);

    const userRoleEntries = selectedUsers.map(user => ({
        value: {
            roles: user.value.roles.filter(role => /^ROLE_USER\w+/.test(role)),
            action: user.value.action,
        },
        label: user.label,
    }));

    const combinedRoles = selectedGroups.concat(userRoleEntries);
    const readRoles = combinedRoles.flatMap(entry => entry.value.roles);
    const writeRoles = combinedRoles
        .filter(entry => entry.value.action === "write")
        .flatMap(entry => entry.value.roles);

    const acl = {
        readRoles: [...new Set(readRoles)],
        writeRoles: [...new Set(writeRoles)],
    };

    return acl;
};


export const getUserRole = (user: UserState) => {
    const userRole = isRealUser(user) && user.roles.find(role => /^ROLE_USER\w+/.test(role));
    return typeof userRole !== "string" ? "unknown" : userRole;
};

const assertUndefined: <T>(value: T) => asserts value is NonNullable<T> = value => {
    if (typeof value === undefined || value === null) {
        throw new Error(`${value} is undefined.`);
    }
};

