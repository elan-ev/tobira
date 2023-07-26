import { useTranslation } from "react-i18next";
import { Breadcrumbs } from "../../../ui/Breadcrumbs";
import { AuthorizedEvent, makeManageVideoRoute } from "./Shared";
import { PageTitle } from "../../../layout/header/ui";
import { MultiValue } from "react-select";
import CreatableSelect from "react-select/creatable";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
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
        <div css={{ maxWidth: 850 }}>
            <AccessUI />
        </div>
    </>;
};


type ACL = {
    readRoles: string[];
    writeRoles: string[];
};

// TODO: custom actions
type Action = "read" | "write";

type Option = {
    value: {
        roles: string[];
        actions: Action;
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
            "ROLE_USER_FRITZ",
            "WACKY_UNKNOWN_ROLE",
        ],
        writeRoles: ["ROLE_USER_ADMIN", "ROLE_INSTRUCTOR", "ROLE_TOBIRA_MODERATOR"],
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
        const readRoles = combinedRoles
            .filter(entry => entry.value.actions === "read")
            .map(entry => entry.value.roles);
        const writeRoles = combinedRoles
            .filter(entry => entry.value.actions === "write")
            .map(entry => entry.value.roles);

        // TODO: somehow get roles of current user to show warning if not included in ACL.
        return {
            readRoles: [...new Set(readRoles.flat())],
            writeRoles: [...new Set(writeRoles.flat())],
        };
    };

    return <>
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
                        console.log(newACL);
                    }}
                >Save</Button>
            </div>
        </div>
    </>;
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
        // TODO: add custom roles?
        const isDark = useColorScheme().scheme === "dark";
        const label = match(kind, {
            "Group": () => "groups",
            "User": () => "users",
        });

        const compareRolesByLength = (a: Option, b: Option) =>
            b.value.roles.length - a.value.roles.length;

        const currentSelections: Option[] = (kind === "User"
            ? makeUserSelection(DUMMY_USERS, currentACL)
            : makeGroupSelection(DUMMY_GROUPS, currentACL))
            .sort(compareRolesByLength);

        const filteredOptions = initialOptions.filter(
            item => !currentSelections.some(elem => elem.value.roles === item.value.roles)
        );

        const [selections, setSelections] = useState<MultiValue<Option>>(currentSelections);
        const [options, setOptions] = useState<MultiValue<Option>>(filteredOptions);

        const remove = (item: Option) => {
            setSelections(prev => prev.filter(
                option => option.value !== item.value
            ));

            setOptions(prev => initialOptions
                .some(option => option.value.roles === item.value.roles)
                ? initialOptions.filter(entry => !selections
                    .filter(option => option.value !== item.value)
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
                return [...choice].sort(compareRolesByLength);
            });

            setOptions(prev => prev.filter(
                option => !choice.some(opt => opt.value.roles === option.value.roles)
            ));
        };

        useImperativeHandle(ref, () => ({
            getSelection: () => selections,
            reset: () => setSelections(currentSelections),
        }));

        const tooltip = (subsets: Option[]) =>
            `This selection is already included in the following
            group(s): ${subsets.map(set => set.label).join(", ")}.
            Allowing other actions here will override the ones previously chosen.`;


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
                tableLayout: "fixed",
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
                        <th css={{ width: "40%" }}>{kind}</th>
                        <th css={{ width: "min-content", textAlign: "center" }}>Actions</th>
                        <th css={{ width: 30 }}></th>
                    </tr>
                </thead>
                <tbody>
                    {selections.map(item =>
                        <tr key={item.label} css={{
                            ...subsets(item, selections).length > 0 && {
                                color: COLORS.neutral60,
                            },
                            borderBottom: `1px solid ${COLORS.neutral05}`,
                            ":last-child": { border: "none" },
                        }}>
                            <td>
                                <span css={{ display: "flex" }}>
                                    {item.label}
                                    {subsets(item, selections).length > 0
                                        && <WithTooltip
                                            tooltip={tooltip(subsets(item, selections))}
                                            tooltipCss={{ width: 300 }}
                                        >
                                            <span css={{ marginLeft: 6 }}>
                                                <FiAlertTriangle css={{ color: COLORS.danger0 }} />
                                            </span>
                                        </WithTooltip>
                                    }
                                </span>
                            </td>
                            <td><ActionsMenu updateSelection={setSelections} item={item} /></td>
                            <td>
                                <ProtoButton
                                    onClick={() => remove(item)}
                                    disabled={item.value.roles.includes("ROLE_ADMIN")}
                                    css={{
                                        margin: "auto",
                                        display: "flex",
                                        color: COLORS.neutral70,
                                        border: `1px solid ${COLORS.neutral40}`,
                                        borderRadius: 4,
                                        padding: 4,
                                        ":hover, :focus": { backgroundColor: COLORS.neutral15 },
                                        ":focus-visible": { borderColor: COLORS.focus },
                                        ...focusStyle({ offset: -1 }),
                                        ":disabled": { display: "none" },
                                    }}
                                ><FiX size={20} /></ProtoButton>
                            </td>
                        </tr>)}
                </tbody>
            </table>
        </div>;
    }
);


type ActionsMenuProps = {
    item: Option;
    updateSelection: React.Dispatch<React.SetStateAction<MultiValue<Option>>>;
}


const ActionsMenu: React.FC<ActionsMenuProps> = ({ item, updateSelection }) => {
    const ref = useRef<FloatingHandle>(null);
    const isDark = useColorScheme().scheme === "dark";

    const actions: Action[] = ["read", "write"];
    const [action, setAction] = useState<Action>(item.value.actions);

    const translation = (label: Action) => match(label, {
        "read": () => "Read",
        "write": () => "Read/Write",
    });


    return item.value.roles.includes("ROLE_ADMIN")
        ? <div>Read/Write</div>
        : <FloatingBaseMenu
            ref={ref}
            label={"acl actions"}
            triggerContent={<>{translation(action)}</>}
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
        roles: ["ROLE_ADMIN", "ROLE_USER_ADMIN", "ROLE_SUDO"],
    },
    "sabine": {
        label: "Sabine Rudolfs",
        roles: ["ROLE_USER_SABINE", "ROLE_INSTRUCTOR", "ROLE_TOBIRA_MODERATOR"],
    },
    "björk": {
        label: "Prof. Björk Guðmundsdóttir",
        roles: ["ROLE_USER_BJÖRK", "ROLE_EXTERNAL", "ROLE_TOBIRA_MODERATOR"],
    },
    "morgan": {
        label: "Morgan Yu",
        roles: ["ROLE_USER_MORGAN", "ROLE_STUDENT", "ROLE_TOBIRA_UPLOAD"],
    },
    "jose": {
        label: "José Carreño Quiñones",
        roles: ["ROLE_USER_JOSE", "ROLE_STUDENT"],
    },
};

const DUMMY_GROUPS: ACLRecord = {
    // TODO: list all possible groups (also from Opencast?).
    // TODO: custom groups??
    // TODO: only one role per group, make another object or sth for subset relations.
    "all": {
        label: "Everyone",
        roles: ["ROLE_ANONYMOUS"],
    },
    "mods": {
        label: "Moderators",
        roles: ["ROLE_TOBIRA_MODERATOR"],
    },
    "special": {
        label: "Mods+Instr",
        roles: ["ROLE_TOBIRA_MODERATOR", "ROLE_INSTRUCTOR"],
    },
    "loggedIn": {
        label: "Logged in users",
        roles: ["ROLE_USER"],
    },
    "students": {
        label: "Students",
        roles: ["ROLE_STUDENT"],
    },
    "funky": {
        label: "Mods+Stud",
        roles: ["ROLE_TOBIRA_MODERATOR", "ROLE_STUDENT"],
    },
};


const subsets = (selection: Option, selectedGroups: MultiValue<Option>) => {
    // Return every other group that is selected and includes every role of
    // the selection and also has the same read/write access level.
    // TODO: change when subsets are defined differently. duh.
    const superSets = selectedGroups.filter(
        group => selection.value.roles.every(
            role => selection.value.roles !== group.value.roles
                // && selection.value.actions === item.value.actions
                && group.value.roles.includes(role)
        )
    );

    return superSets;
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

const getActions = (acl: ACL, role: string): Action => {
    if (acl.readRoles.includes(role) && acl.writeRoles.includes(role)) {
        return "write";
    }
    return "read";
};

const makeUserSelection = (
    users: ACLRecord,
    acl: ACL
): Option[] => {
    const user = useUser();
    const aclArray = [...new Set(acl.readRoles.concat(acl.writeRoles))];
    return aclArray.map(role => {
        const roles = Object.values(users).find(user => user.roles.includes(role))?.roles ?? [role];

        if (roles.includes("ROLE_ADMIN") && isRealUser(user)) {
            // TODO: find out how to check roles of user to conditionally show or hide entry.
        }

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
    const regEx = /^ROLE_USER\w+/;
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

