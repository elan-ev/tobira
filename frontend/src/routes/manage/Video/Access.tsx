import { useTranslation } from "react-i18next";
import { Breadcrumbs } from "../../../ui/Breadcrumbs";
import { AuthorizedEvent, makeManageVideoRoute } from "./Shared";
import { PageTitle } from "../../../layout/header/ui";
import { MultiValue } from "react-select";
import CreatableSelect from "react-select/creatable";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { COLORS } from "../../../color";
import { FiAlertTriangle, FiX } from "react-icons/fi";
import { Button } from "../../../ui/Button";
import { searchableSelectStyles, theme } from "../../../ui/SearchableSelect";
import { isRealUser, useUser } from "../../../User";
import { NotAuthorized } from "../../../ui/error";
import {
    Floating,
    FloatingHandle,
    ProtoButton,
    WithTooltip,
    match,
    useColorScheme,
} from "@opencast/appkit";
import { FloatingBaseMenu, MenuItem } from "../../../ui/Blocks/Series";
import { focusStyle } from "../../../ui";


export const ManageVideoAccessRoute = makeManageVideoRoute(
    "acl",
    "/access",
    event => <ACLPage event={event} />,
);

type Props = {
    event: AuthorizedEvent;
};

const ACLPage: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation();
    const user = useUser();

    if (!isRealUser(user)) {
        return <NotAuthorized />;
    }

    const breadcrumbs = [
        { label: t("user.manage-content"), link: "/~manage" },
        { label: t("manage.my-videos.title"), link: "/~manage/videos" },
        { label: event.title, link: `/~manage/videos/${event.id.substring(2)}` },
    ];

    return <>
        <Breadcrumbs path={breadcrumbs} tail={t("manage.my-videos.acl.title")} />
        <PageTitle title={t("manage.my-videos.acl.title")} />
        <AccessUI />
    </>;
};


type ACL = {
    readRoles: string[];
    writeRoles: string[];
};

// TODO: custom actions
type Actions = "read" | "write";

type Option = {
    value: {
        roles: string[];
        actions: Actions;
    };
    label: string;
}

const AccessUI: React.FC = () => {
    const groupsRef = useRef<ACLSelectHandle>(null);
    const usersRef = useRef<ACLSelectHandle>(null);

    // This is the data structure I expect from an ACL. Right now this isn't real world data.
    const currentACL: ACL = {
        readRoles: [
            "ROLE_USER_ADMIN",
            "ROLE_INSTRUCTOR",
            "ROLE_USER_SABINE",
            "ROLE_STUDENT",
            "ROLE_TOBIRA_MODERATOR",
            "ROLE_INSTRUCTOR",
            "ROLE_USER_FRITZ",
            "WACKY_UNKNOWN_ROLE",
            "ROLE_USER_BJÖRK",
            "ROLE_ANONYMOUS",
            "ROLE_TOBIRA_GURU",
            "ROLE_TOBIRA_STUDIO",
        ],
        writeRoles: [
            "ROLE_TOBIRA_STUDIO",
            "ROLE_USER_ADMIN",
            "ROLE_INSTRUCTOR",
            "ROLE_TOBIRA_MODERATOR",
            "ROLE_TOBIRA_GURU",
        ],
    };

    const currentGroupACL: ACL = {
        readRoles: splitAcl(currentACL.readRoles)[0],
        writeRoles: splitAcl(currentACL.writeRoles)[0],
    };

    const currentUserACL: ACL = {
        readRoles: splitAcl(currentACL.readRoles)[1],
        writeRoles: splitAcl(currentACL.writeRoles)[1],
    };

    const groupOptions = buildOptions(DUMMY_GROUPS);
    const userOptions = buildOptions(DUMMY_USERS);


    const getSelections = (): ACL => {
        const selectedGroups = groupsRef.current?.getSelection();
        const selectedUsers = usersRef.current?.getSelection();

        assertUndefined(selectedGroups);
        assertUndefined(selectedUsers);

        // Filter out non user roles from user entries.
        const userRoleEntries = selectedUsers.map(user => ({
            value: {
                roles: user.value.roles.filter(role => /^ROLE_USER\w+/.test(role)),
                actions: user.value.actions,
            },
            label: user.label,
        }));

        const combinedRoles = selectedGroups.concat(userRoleEntries);
        const readRoles = combinedRoles.map(entry => entry.value.roles);
        const writeRoles = combinedRoles
            .filter(entry => entry.value.actions === "write")
            .map(entry => entry.value.roles);

        return {
            readRoles: [...new Set(readRoles.flat())],
            writeRoles: [...new Set(writeRoles.flat())],
        };
    };

    return (
        <div css={{ maxWidth: 1040 }}>
            <div css={{
                display: "flex",
                flexDirection: "column",
                width: "100%",
            }}>
                <div css={{
                    display: "flex",
                    flexDirection: "row",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 24,
                }}>
                    <ACLSelect
                        ref={groupsRef}
                        kind="Group"
                        currentACL={currentGroupACL}
                        initialOptions={groupOptions}
                    />
                    <ACLSelect
                        ref={usersRef}
                        kind="User"
                        currentACL={currentUserACL}
                        initialOptions={userOptions}
                    />
                </div>
                <div css={{ alignSelf: "flex-start", marginTop: 40 }}>
                    <Button
                        kind="danger"
                        css={{ marginRight: 8 }}
                        onClick={() => {
                            groupsRef.current?.reset();
                            usersRef.current?.reset();
                        }}
                    >Reset</Button>
                    <Button
                        kind="happy"
                        onClick={() => {
                            const newACL = getSelections();
                            // TODO: show warning modal if current user is not included in ACL.
                            console.log(newACL);
                        }}
                    >Save</Button>
                </div>
            </div>
        </div>
    );
};


type ACLSelectProps = {
    currentACL: ACL;
    initialOptions: Option[];
    kind: "Group" | "User";
};

type ACLSelectHandle = {
    getSelection: () => MultiValue<Option>;
    reset: () => void;
};

const ACLSelect = forwardRef<ACLSelectHandle, ACLSelectProps>(
    ({ currentACL, initialOptions, kind }, ref) => {
        const isDark = useColorScheme().scheme === "dark";
        const label = match(kind, {
            "Group": () => "groups",
            "User": () => "users",
        });

        const compareRoles = (a: Option, b: Option) =>
            Number(subsetRelations.some(set => set.superset === b.value.roles[0]))
                - Number(subsetRelations.some(set => set.superset === a.value.roles[0]));


        const currentSelections: Option[] = (kind === "User"
            ? makeUserSelection(DUMMY_USERS, currentACL)
            : makeGroupSelection(DUMMY_GROUPS, currentACL))
            .sort((compareRoles));

        const filteredOptions = initialOptions.filter(
            item => !currentSelections.some(elem => elem.value.roles === item.value.roles)
        );

        const [selections, setSelections] = useState<MultiValue<Option>>(currentSelections);
        const [options, setOptions] = useState<MultiValue<Option>>(filteredOptions);

        const remove = (item: Option) => {
            const filterItem = (items: MultiValue<Option>) => items.filter(
                option => option.value !== item.value
            );

            setSelections(prev => filterItem(prev));
            setOptions(prev => initialOptions
                .some(option => option.value.roles === item.value.roles)
                ? initialOptions.filter(entry => !filterItem(selections)
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
                    actions: "read",
                },
                label: inputValue,
            };
            setSelections(prev => [...prev, newRole]);
        };

        const handleChange = (choice: MultiValue<Option>) => {
            setSelections(prev => {
                const newItem = choice.filter(option => !prev.includes(option));
                newItem[0].value.actions = "read";
                return [...choice].sort(compareRoles);
            });

            setOptions(prev => prev.filter(
                option => !choice.some(opt => opt.value.roles === option.value.roles)
            ));
        };

        useImperativeHandle(ref, () => ({
            getSelection: () => selections,
            reset: () => {
                setSelections(currentSelections);
                setOptions(filteredOptions);
            },
        }));


        return <div css={{
            flex: "1 1 320px",
            display: "flex",
            flexDirection: "column",
            maxWidth: 500,
        }}>
            <h4>{`Authorized ${label}`}</h4>
            <CreatableSelect
                controlShouldRenderValue={false}
                isClearable={false}
                isMulti
                isSearchable
                placeholder={`Select ${label}`}
                formatCreateLabel={input => /^ROLE_\w+/.test(input) && `Create ${input}`}
                value={selections}
                options={options}
                onCreateOption={handleCreate}
                filterOption={(option, inputValue) =>
                    !!option.label && option.label.toLowerCase().includes(inputValue.toLowerCase())
                }
                onChange={handleChange}
                styles={searchableSelectStyles(isDark)}
                theme={theme}
                css={{ marginTop: 6 }}
            />
            <table css={{
                marginTop: 20,
                tableLayout: "auto",
                width: "100%",
                borderRadius: 4,
                borderCollapse: "collapse",
                backgroundColor: COLORS.neutral10,
                overflow: "hidden",
                "th, td": {
                    textAlign: "left",
                    padding: "6px 12px",
                },
            }}>
                <thead>
                    <tr css={{ borderBottom: `2px solid ${COLORS.neutral05}` }}>
                        <th>{kind}</th>
                        <th>Actions</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {selections.map(item =>
                        <ListEntry
                            key={item.label}
                            item={item}
                            selections={selections}
                            setSelections={setSelections}
                            remove={remove}
                        />)
                    }
                </tbody>
            </table>
        </div>;
    }
);

type ListEntryProps = {
    item: Option;
    selections: MultiValue<Option>;
    setSelections: React.Dispatch<React.SetStateAction<MultiValue<Option>>>;
    remove: (item: Option) => void;
}

const ListEntry: React.FC<ListEntryProps> = (
    { item, selections, setSelections, remove }
) => {
    const user = useUser();
    const [isSubset, setIsSubset] = useState<boolean>(
        supersetList(item, selections).length > 0
    );

    const [supersets, setSupersets] = useState(
        supersetList(item, selections).map(set => set.label)
    );

    const updateStates = () => {
        setIsSubset(supersetList(item, selections).length > 0);
        setSupersets(supersetList(item, selections).map(set => set.label));
    };

    useEffect(() => {
        updateStates();
    }, [selections]);


    const tooltip = (supersets: string[]) =>
        `This selection is already included in the following
        group(s): ${supersets.join(", ")}. Allowing other actions
        here will override the ones previously chosen.`;

    if (item.value.roles.includes("ROLE_ADMIN")
            && isRealUser(user)
            && !user.roles.includes("ROLE_ADMIN")) {
        return null;
    }
    return <tr key={item.label} css={{
        height: 44,
        ":hover, :focus-within": {
            backgroundColor: COLORS.neutral15,
        },
        ...isSubset && {
            color: COLORS.neutral60,
        },
        borderBottom: `1px solid ${COLORS.neutral05}`,
        ":last-child": { border: "none" },
    }}>
        <td>
            <span css={{ display: "flex" }}>
                {item.label}
                {isSubset && <WithTooltip
                    tooltip={tooltip(supersets)}
                    tooltipCss={{ width: 300 }}
                    css={{ display: "flex" }}
                >
                    <span css={{ marginLeft: 6, display: "flex" }}>
                        <FiAlertTriangle css={{
                            color: COLORS.danger0,
                            alignSelf: "center",
                        }} />
                    </span>
                </WithTooltip>
                }
            </span>
        </td>
        <td><ActionsMenu
            updateSelection={setSelections}
            item={item}
            updateStates={updateStates}
        /></td>
        <td>
            <ProtoButton
                onClick={() => remove(item)}
                disabled={item.value.roles.includes("ROLE_ADMIN")}
                css={{
                    margin: "auto",
                    display: "flex",
                    color: COLORS.neutral60,
                    borderRadius: 4,
                    padding: 4,
                    ":hover, :focus-visible": { color: COLORS.danger0 },
                    ":disabled": { display: "none" },
                    ...focusStyle({ offset: -1 }),
                }}
            ><FiX size={20} /></ProtoButton>
        </td>
    </tr>;
};


type ActionsMenuProps = {
    item: Option;
    updateSelection: React.Dispatch<React.SetStateAction<MultiValue<Option>>>;
    updateStates: () => void;
}


const ActionsMenu: React.FC<ActionsMenuProps> = (
    { item, updateSelection, updateStates }
) => {
    const ref = useRef<FloatingHandle>(null);
    const isDark = useColorScheme().scheme === "dark";
    const { t } = useTranslation();

    const actions: Actions[] = ["read", "write"];
    const [action, setAction] = useState<Actions>(item.value.actions);

    const translation = (label: Actions) => match(label, {
        "read": () => t("manage.access.read"),
        "write": () => t("manage.access.write"),
    });

    useEffect(() => {
        updateStates();
    }, [action]);


    return item.value.roles.includes("ROLE_ADMIN")
        ? <span css={{ marginLeft: 8 }}>{t("manage.access.write")}</span>
        : <FloatingBaseMenu
            ref={ref}
            label={"acl actions"}
            triggerContent={<>{translation(action)}</>}
            triggerStyles={{
                width: 120,
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
                        {actions.map(actionItem => <MenuItem
                            key={actionItem}
                            disabled={actionItem === action}
                            label={translation(actionItem)}
                            onClick={() => {
                                setAction(actionItem);
                                updateSelection(prev => {
                                    const index = prev.findIndex(
                                        entry => entry.value === item.value
                                    );

                                    prev[index].value.actions = actionItem;
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


type ACLRecord = Record<string, { label: string; roles: string[] }>

const DUMMY_USERS: ACLRecord = {
    "admin": {
        label: "Administrator",
        roles: ["ROLE_ADMIN", "ROLE_USER_ADMIN", "ROLE_SUDO", "ROLE_USER", "ROLE_ANONYMOUS"],
    },
    "sabine": {
        label: "Sabine Rudolfs",
        roles: [
            "ROLE_USER_SABINE",
            "ROLE_INSTRUCTOR",
            "ROLE_TOBIRA_MODERATOR",
            "ROLE_USER",
            "ROLE_ANONYMOUS",
        ],
    },
    "björk": {
        label: "Prof. Björk Guðmundsdóttir",
        roles: [
            "ROLE_USER_BJÖRK",
            "ROLE_EXTERNAL",
            "ROLE_TOBIRA_MODERATOR",
            "ROLE_USER",
            "ROLE_ANONYMOUS",
        ],
    },
    "morgan": {
        label: "Morgan Yu",
        roles: [
            "ROLE_USER_MORGAN",
            "ROLE_STUDENT",
            "ROLE_TOBIRA_UPLOAD",
            "ROLE_USER",
            "ROLE_ANONYMOUS",
        ],
    },
    "jose": {
        label: "José Carreño Quiñones",
        roles: ["ROLE_USER_JOSE", "ROLE_STUDENT", "ROLE_USER", "ROLE_ANONYMOUS"],
    },
};

const DUMMY_GROUPS: ACLRecord = {
    // TODO: get all possible groups (also from Opencast?).
    // TODO: custom groups??
    "all": {
        label: "Everyone",
        roles: ["ROLE_ANONYMOUS"],
    },
    "loggedIn": {
        label: "Logged in users",
        roles: ["ROLE_USER"],
    },
    "opencast": {
        label: "Opencast gurus",
        roles: ["ROLE_TOBIRA_GURU"],
    },
    "mods": {
        label: "Moderators",
        roles: ["ROLE_TOBIRA_MODERATOR"],
    },
    "instructors": {
        label: "Instructors",
        roles: ["ROLE_INSTRUCTOR"],
    },
    "students": {
        label: "Students",
        roles: ["ROLE_STUDENT"],
    },
    "studio": {
        label: "Studio users",
        roles: ["ROLE_TOBIRA_STUDIO"],
    },
    "upload": {
        label: "Editors",
        roles: ["ROLE_TOBIRA_EDITOR"],
    },
};

type SubsetList = {
    superset: string;
    subsets: string[];
}

const subsetRelations: SubsetList[] = [
    {
        superset: "ROLE_ANONYMOUS",
        subsets: [
            "ROLE_TOBIRA_MODERATOR",
            "ROLE_INSTRUCTOR",
            "ROLE_USER",
            "ROLE_STUDENT",
            "ROLE_TOBIRA_STUDIO",
            "ROLE_TOBIRA_EDITOR",
            "ROLE_TOBIRA_GURU",
        ],
    },
    {
        superset: "ROLE_USER",
        subsets: [
            "ROLE_TOBIRA_MODERATOR",
            "ROLE_INSTRUCTOR",
            "ROLE_STUDENT",
            "ROLE_TOBIRA_STUDIO",
            "ROLE_TOBIRA_EDITOR",
        ],
    },
    {
        superset: "ROLE_TOBIRA_GURU",
        subsets: ["ROLE_TOBIRA_STUDIO", "ROLE_TOBIRA_EDITOR"],
    },
];



const supersetList = (selection: Option, selectedGroups: MultiValue<Option>) => {
    // Return every other group that is selected and whose subset includes the role of
    // the selection and also has the same read/write (or a subset of write) access level.
    // TODO: check actions
    const roleToCheck = selection.value.roles[0];

    const supersets = selectedGroups
        .filter(group => subsetRelations.some(set => set.superset === group.value.roles[0]
            && set.subsets.includes(roleToCheck))
            && (group.value.actions === selection.value.actions));

    return supersets;
};


const getDisplayName = (
    users: ACLRecord,
    role: string,
) => {
    const name = Object.values(users).filter(item => item.roles.includes(role));

    return name.length === 1
        ? name[0].label
        : formatUnknownUserRole(role);
};

const formatUnknownUserRole = (role: string) => {
    if (role.startsWith("ROLE_USER_")) {
        const name = role.replace("ROLE_USER_", "").toLowerCase();
        return name.charAt(0).toUpperCase() + name.slice(1);
    }

    return role;
};

const getActions = (acl: ACL, role: string): Actions => {
    if (acl.readRoles.includes(role) && acl.writeRoles.includes(role)) {
        return "write";
    }
    return "read";
};

const makeUserSelection = (
    users: ACLRecord,
    acl: ACL
): Option[] => {
    const aclArray = [...new Set(acl.readRoles.concat(acl.writeRoles))];
    return aclArray.map(role => {
        const roles = Object.values(users).find(user => user.roles.includes(role))?.roles ?? [role];

        return {
            value: {
                roles: roles,
                actions: getActions(acl, role),
            },
            label: getDisplayName(users, role),
        };
    });
};

const makeGroupSelection = (
    groupList: ACLRecord,
    acl: ACL,
): Option[] => {
    const groups = Object.values(groupList);
    const current: Option[] = [];

    for (const group of groups) {
        if (group.roles.every(role => acl.readRoles.includes(role))
            && group.roles.every(role => acl.writeRoles.includes(role))) {
            current.push({
                value: {
                    roles: group.roles,
                    actions: "write",
                },
                label: group.label,
            });
        } else if (group.roles.every(role => acl.readRoles.includes(role))) {
            current.push({
                value: {
                    roles: group.roles,
                    actions: "read",
                },
                label: group.label,
            });
        }
    }

    return current;
};


const splitAcl = (roleList: string[]) => {
    const regEx = /^ROLE_USER_\w+/;
    const groupAcl = roleList.filter(role => !regEx.test(role));
    const userAcl = roleList.filter(role => regEx.test(role));

    return [groupAcl, userAcl];
};


const buildOptions = (items: ACLRecord): Option[] =>
    Object.values(items).map(item => ({
        value: {
            roles: item.roles,
            actions: "read",
        },
        label: item.label,
    }));


const assertUndefined: <T>(value: T) => asserts value is NonNullable<T> = value => {
    if (typeof value === undefined || value === null) {
        throw new Error(`${value} is undefined.`);
    }
};

