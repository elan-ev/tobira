import { useTranslation } from "react-i18next";
import { Breadcrumbs } from "../../../ui/Breadcrumbs";
import { AuthorizedEvent, makeManageVideoRoute } from "./Shared";
import { PageTitle } from "../../../layout/header/ui";
import Select, { MultiValue } from "react-select";
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

type Action = "read" | "write" | "readWrite"

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
        const groupRoles = groupsRef.current?.getSelection();
        const userRoles = usersRef.current?.getSelection();

        assertUndefined(groupRoles);
        assertUndefined(userRoles);

        // Filter out non user roles from user entries.
        const userRoleEntries = userRoles.map(user => ({
            value: {
                roles: user.value.roles.filter(role => /^ROLE_USER\w+/.test(role)),
                actions: user.value.actions,
            },
            label: user.label,
        }));

        const combinedRoles = groupRoles.concat(userRoleEntries);
        const readRoles = combinedRoles
            .filter(entry => entry.value.actions === "read" || entry.value.actions === "readWrite")
            .map(entry => entry.value.roles);
        const writeRoles = combinedRoles
            .filter(entry => entry.value.actions === "write" || entry.value.actions === "readWrite")
            .map(entry => entry.value.roles);

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
            <div css={{
                alignSelf: "flex-start",
                marginTop: 40,
            }}>
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
        const isDark = useColorScheme().scheme === "dark";
        const label = kind.toLocaleLowerCase() + "s";

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

            setOptions(initialOptions.filter(entry => !selections
                .filter(option => option.value !== item.value)
                .some(option => entry.value.roles === option.value.roles)));
        };

        useImperativeHandle(ref, () => ({
            getSelection: () => selections,
            reset: () => setSelections(currentSelections),
        }));

        return <div css={{
            flex: "1 1 320px",
            display: "flex",
            flexDirection: "column",
            maxWidth: 500,
        }}>
            <h4>{`Authorized ${label}`}</h4>
            <Select
                controlShouldRenderValue={false}
                isClearable={false}
                isMulti
                isSearchable
                placeholder={`Select ${label}`}
                value={selections}
                options={options}
                onChange={choice => {
                    setSelections(prev => {
                        const newItem = choice.filter(option => !prev.includes(option));
                        newItem[0].value.actions = "read";
                        return [...choice].sort(compareRolesByLength);
                    });
                }}
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
                "thead tr": {
                    borderBottom: `2px solid ${COLORS.neutral05}`,
                },
                "tbody tr": {
                    borderBottom: `1px solid ${COLORS.neutral05}`,
                    ":last-child": { border: "none" },
                },
            }}>
                <thead>
                    <tr>
                        <th css={{ width: "40%" }}>{kind}</th>
                        <th css={{ width: "min-content", textAlign: "center" }}>Actions</th>
                        <th css={{ width: 30 }}></th>
                    </tr>
                </thead>
                <tbody>
                    {selections.map(item => <tr key={item.label}>
                        <td>
                            {item.label}
                        </td>
                        <td><ActionsMenu updateSelection={setSelections} item={item} /></td>
                        <td>
                            <ProtoButton
                                onClick={() => remove(item)}
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
                                }}
                            >
                                <FiX size={20} />
                            </ProtoButton>
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

    const actions: Action[] = ["read", "write", "readWrite"];
    const [action, setAction] = useState<Action>(item.value.actions);

    const translation = (label: Action) => match(label, {
        "read": () => "Read only",
        "write": () => "Write only",
        "readWrite": () => "Read/Write",
    });


    return (
        <FloatingBaseMenu
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
        />
    );
};


type ItemType = Record<string, { displayName: string; roles: string[] }>


const DUMMY_USERS: ItemType = {
    "admin": {
        displayName: "Administrator",
        roles: ["ROLE_ADMIN", "ROLE_USER_ADMIN", "ROLE_SUDO"],
    },
    "sabine": {
        displayName: "Sabine Rudolfs",
        roles: ["ROLE_USER_SABINE", "ROLE_INSTRUCTOR", "ROLE_TOBIRA_MODERATOR"],
    },
    "björk": {
        displayName: "Prof. Björk Guðmundsdóttir",
        roles: ["ROLE_USER_BJÖRK", "ROLE_EXTERNAL", "ROLE_TOBIRA_MODERATOR"],
    },
    "morgan": {
        displayName: "Morgan Yu",
        roles: ["ROLE_USER_MORGAN", "ROLE_STUDENT", "ROLE_TOBIRA_UPLOAD"],
    },
    "jose": {
        displayName: "José Carreño Quiñones",
        roles: ["ROLE_USER_JOSE", "ROLE_STUDENT"],
    },
};

const DUMMY_GROUPS: ItemType = {
    // "all": {
    //     label: "Everyone",
    //     roles: [],
    // },
    "mods": {
        displayName: "Moderators",
        roles: ["ROLE_TOBIRA_MODERATOR"],
    },
    "special": {
        displayName: "Mods+Instr",
        roles: ["ROLE_TOBIRA_MODERATOR", "ROLE_INSTRUCTOR"],
    },
    "loggedIn": {
        displayName: "Logged in users",
        roles: ["ROLE_USER_"],
    },
    "students": {
        displayName: "Students",
        roles: ["ROLE_STUDENT"],
    },
    "funky": {
        displayName: "Mods+Stud",
        roles: ["ROLE_TOBIRA_MODERATOR", "ROLE_STUDENT"],
    },
};



const getDisplayName = (
    users: ItemType,
    role: string,
) => {
    const name = Object.values(users).filter(item => item.roles.includes(role));

    return name.length === 1
        ? name[0].displayName
        : role;
};

const getActions = (acl: ACL, role: string): Action => {
    if (acl.readRoles.includes(role) && acl.writeRoles.includes(role)) {
        return "readWrite";
    }
    if (acl.writeRoles.includes(role)) {
        return "write";
    }
    return "read";
};

const makeUserSelection = (
    users: ItemType,
    acl: ACL
): Option[] => {
    const aclArray = [...new Set(acl.readRoles.concat(acl.writeRoles))];
    return aclArray.map(role => {
        const roles = Object.values(users).find(user => user.roles.includes(role));
        assertUndefined(roles);
        return {
            value: {
                roles: roles.roles,
                actions: getActions(acl, role),
            },
            label: getDisplayName(users, role),
        };
    });
};

const makeGroupSelection = (
    groupList: ItemType,
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
                    actions: "readWrite",
                },
                label: group.displayName,
            });
        } else if (group.roles.every(role => acl.readRoles.includes(role))) {
            current.push({
                value: {
                    roles: group.roles,
                    actions: "read",
                },
                label: group.displayName,
            });
        } else if (group.roles.every(role => acl.writeRoles.includes(role))) {
            current.push({
                value: {
                    roles: group.roles,
                    actions: "write",
                },
                label: group.displayName,
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


const buildOptions = (items: ItemType): Option[] =>
    Object.values(items).map(item => ({
        value: {
            roles: item.roles,
            actions: "read",
        },
        label: item.displayName,
    }));


const assertUndefined: <T>(value: T) => asserts value is NonNullable<T> = value => {
    if (typeof value === undefined || value === null) {
        throw new Error(`${value} is undefined.`);
    }
};

