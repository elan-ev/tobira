import { useTranslation } from "react-i18next";
import { Breadcrumbs } from "../../../ui/Breadcrumbs";
import { AuthorizedEvent, makeManageVideoRoute } from "./Shared";
import { PageTitle } from "../../../layout/header/ui";
import { MultiValue, Props as SelectProps } from "react-select";
import CreatableSelect from "react-select/creatable";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { COLORS } from "../../../color";
import { FiAlertTriangle, FiInfo, FiX } from "react-icons/fi";
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
import { FloatingBaseMenu } from "../../../ui/Blocks/Series";
import { focusStyle } from "../../../ui";
import { ConfirmationModal, ConfirmationModalHandle, Modal } from "../../../ui/Modal";
import { currentRef } from "../../../util";
import i18n from "../../../i18n";
import {
    DUMMY_GROUPS, DUMMY_USERS, subsetRelations, ACLRecord, ACL, currentACL
} from "./dummy_data";


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
        {/* TODO: Check actual unlisted status of event. */}
        {event.hostRealms.length < 1 && <UnlistedNote event={event} />}
        <AccessUI currentACL={currentACL} event={event} />
    </>;
};


const UnlistedNote: React.FC<{ event: AuthorizedEvent }> = ({ event }) => {
    const { t } = useTranslation();

    return (
        <WithTooltip
            tooltip={"It can only be found by sharing its direct link."}
            placement="bottom"
            css={{ display: "inline-block" }}
        >
            <div css={{
                fontSize: 14,
                lineHeight: 1,
                color: COLORS.neutral60,
                display: "flex",
                gap: 4,
                marginBottom: 16,
            }}>
                <FiInfo />
                This video is unlisted.
            </div>
        </WithTooltip>
    );
};


// TODO: Handle custom actions.
type Actions = "read" | "write";

type Option = {
    value: {
        roles: string[];
        actions: Actions;
    };
    label: string;
}

type AccessUIProps = {
    currentACL: ACL;
    event?: AuthorizedEvent;
}

const AccessUI: React.FC<AccessUIProps> = ({ currentACL }) => {
    // TODO: read ACL from event.
    const { t } = useTranslation();
    const user = useUser();
    const groupsRef = useRef<ACLSelectHandle>(null);
    const usersRef = useRef<ACLSelectHandle>(null);

    const saveModalRef = useRef<ConfirmationModalHandle>(null);
    const resetModalRef = useRef<ConfirmationModalHandle>(null);

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


    const containsUser = (acl: ACL) => {
        const userRole = isRealUser(user) && user.roles.find(role => /^ROLE_USER\w+/.test(role));

        return userRole && acl.writeRoles.includes(userRole);
    };

    const submit = (acl: ACL) => {
        // TODO: Actually save new ACL.
        console.log(acl);
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
                        initialACL={currentGroupACL}
                        allOptions={groupOptions}
                    />
                    <ACLSelect
                        ref={usersRef}
                        kind="User"
                        initialACL={currentUserACL}
                        allOptions={userOptions}
                    />
                </div>
                <div css={{ alignSelf: "flex-start", marginTop: 40 }}>
                    <Button
                        kind="danger"
                        css={{ marginRight: 8 }}
                        onClick={() => currentRef(resetModalRef).open()}
                    >{t("manage.access.reset-modal.label")}</Button>
                    <Modal ref={resetModalRef} title={t("manage.access.reset-modal.title")}>
                        <p>{t("manage.access.reset-modal.body")}</p>
                        <div css={{
                            display: "flex",
                            gap: 12,
                            justifyContent: "center",
                            flexWrap: "wrap",
                            marginTop: 32,
                        }}>
                            <Button onClick={() => currentRef(resetModalRef).close?.()}
                            >{t("cancel")}</Button>
                            <Button kind="danger" onClick={() => {
                                groupsRef.current?.reset();
                                usersRef.current?.reset();
                                currentRef(resetModalRef).close?.();
                            }}
                            >{t("manage.access.reset-modal.label")}</Button>
                        </div>
                    </Modal>
                    <Button
                        kind="happy"
                        onClick={() => {
                            const newACL = getSelections();
                            if (!containsUser(newACL)) {
                                currentRef(saveModalRef).open();
                            } else {
                                submit(newACL);
                            }
                        }}
                    >{t("save")}</Button>
                    <ConfirmationModal
                        title={t("manage.access.save-modal.title")}
                        buttonContent={t("manage.access.save-modal.confirm")}
                        ref={saveModalRef}
                        onSubmit={() => submit(getSelections())}
                    >
                        <p>{t("manage.access.save-modal.body")}</p>
                    </ConfirmationModal>
                </div>
            </div>
        </div>
    );
};


type ACLSelectProps = SelectProps & {
    initialACL: ACL;
    allOptions: Option[];
    kind: "Group" | "User";
};

type ACLSelectHandle = {
    getSelection: () => MultiValue<Option>;
    reset: () => void;
};

const ACLSelect = forwardRef<ACLSelectHandle, ACLSelectProps>(
    ({ initialACL, allOptions, kind }, ref) => {
        const [menuIsOpen, setMenuIsOpen] = useState<boolean>(false);
        const isDark = useColorScheme().scheme === "dark";

        const label = match(kind, {
            "Group": () => "groups",
            "User": () => "users",
        });

        const roleComparator = (a: Option, b: Option) =>
            Number(subsetRelations.some(set => set.superset === b.value.roles[0]))
                - Number(subsetRelations.some(set => set.superset === a.value.roles[0]));

        const initialSelections: Option[] = (kind === "User"
            ? makeUserSelection(DUMMY_USERS, initialACL)
            : makeGroupSelection(DUMMY_GROUPS, initialACL))
            .sort((roleComparator));

        const initialOptions = allOptions.filter(
            item => !initialSelections.some(elem => elem.value.roles === item.value.roles)
        );

        const [selections, setSelections] = useState<MultiValue<Option>>(initialSelections);
        const [options, setOptions] = useState<MultiValue<Option>>(initialOptions);

        const [_supersets, setSupersets] = useState<MultiValue<Option>>(
            selections.filter(selection => supersetList(selection, selections).length > 0)
        );

        useImperativeHandle(ref, () => ({
            getSelection: () => selections,
            reset: () => {
                setSelections(initialSelections);
                setOptions(initialOptions);
            },
        }));


        const remove = (item: Option) => {
            const filterItem = (items: MultiValue<Option>) => items.filter(
                option => option.value !== item.value
            );

            setSelections(prev => filterItem(prev));
            setOptions(prev => allOptions
                .some(option => option.value.roles === item.value.roles)
                ? allOptions.filter(entry => !filterItem(selections)
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
                    handleChange([...selections, ...optionsToAdd]);
                    setMenuIsOpen(false);
                }
            }
        };


        return <div css={{
            flex: "1 1 320px",
            display: "flex",
            flexDirection: "column",
            maxWidth: 500,
        }}>
            <h4>{`Authorized ${label}`}</h4>
            <div onPaste={handlePaste}>
                <CreatableSelect
                    onMenuOpen={() => setMenuIsOpen(true)}
                    onMenuClose={() => setMenuIsOpen(false)}
                    menuIsOpen={menuIsOpen}
                    controlShouldRenderValue={false}
                    isClearable={false}
                    isMulti
                    isSearchable
                    placeholder={`Select ${label}`}
                    formatCreateLabel={input => /^ROLE_\w+/.test(input) && `Create ${input}`}
                    value={selections}
                    options={options}
                    onCreateOption={handleCreate}
                    filterOption={(option, inputValue) => !!option.label
                        && option.label.toLowerCase().includes(inputValue.toLowerCase())
                    }
                    backspaceRemovesValue={false}
                    onChange={handleChange}
                    styles={searchableSelectStyles(isDark)}
                    theme={theme}
                    css={{ marginTop: 6 }}
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
                                setSupersets={setSupersets}
                            />)
                        }
                    </tbody>
                </table>
            </div>
        </div>;
    }
);


type ListEntryProps = {
    item: Option;
    selections: MultiValue<Option>;
    setSelections: React.Dispatch<React.SetStateAction<MultiValue<Option>>>;
    setSupersets: React.Dispatch<React.SetStateAction<MultiValue<Option>>>;
    remove: (item: Option) => void;
}

const ListEntry: React.FC<ListEntryProps> = (
    { item, selections, setSelections, remove, setSupersets }
) => {
    const user = useUser();
    const isSubset = supersetList(item, selections).length > 0;

    const updateStates = () => {
        setSupersets(
            selections.filter(selection => supersetList(selection, selections).length > 0)
        );
    };


    const tooltip = (setNames: string[]) =>
        `This selection is already included in the following
        group(s): ${setNames.join(", ")}. Allowing other actions
        here will override the ones previously chosen.`;

    if (item.value.roles.includes("ROLE_ADMIN")
            && isRealUser(user)
            && !user.roles.includes("ROLE_ADMIN")) {
        return null;
    }
    return <tr key={item.label} css={{
        height: 44,
        ":hover, :focus-within": {
            td: { backgroundColor: COLORS.neutral15 },
        },
        ...isSubset && {
            color: COLORS.neutral60,
        },
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
                {item.label}
                {isSubset && <WithTooltip
                    tooltip={tooltip(supersetList(item, selections).map(set => set.label))}
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

    const actionLabel = (label: Actions) => match(label, {
        "read": () => t("manage.access.actions.read"),
        "write": () => t("manage.access.actions.write"),
    });

    const actionDescription = (label: Actions) => match(label, {
        "read": () => t("manage.access.actions.read-explanation"),
        "write": () => t("manage.access.actions.write-explanation"),
    });

    useEffect(() => {
        updateStates();
    }, [action]);

    const language = i18n.resolvedLanguage;

    return item.value.roles.includes("ROLE_ADMIN")
        ? <span css={{ marginLeft: 8 }}>{t("manage.access.actions.write")}</span>
        : <FloatingBaseMenu
            ref={ref}
            label={"acl actions"}
            triggerContent={<>{actionLabel(action)}</>}
            triggerStyles={{
                width: language === "en" ? 80 : 115,
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
                            label={actionLabel(actionItem)}
                            description={actionDescription(actionItem)}
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

type MenuItemProps = {
    label: string;
    description: string;
    onClick: () => void;
    close: () => void;
    disabled?: boolean;
};

const MenuItem: React.FC<MenuItemProps> = ({ label, description, onClick, close, disabled }) => {
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
        }}>
            <ProtoButton
                ref={ref}
                disabled={disabled}
                role="menuitem"
                onClick={() => {
                    onClick();
                    close();
                }}
                css={{
                    width: 200,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    svg: { fontSize: 16 },
                    ":hover, :focus": {
                        backgroundColor: isDark ? COLORS.neutral10 : COLORS.neutral15,
                    },
                    ...focusStyle({ inset: true }),
                    "&[disabled] span": {
                        fontWeight: "bold",
                        color: COLORS.neutral80,
                        pointerEvents: "none",
                        ...isDark && { backgroundColor: COLORS.neutral10 },
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


const supersetList = (selection: Option, selectedGroups: MultiValue<Option>) => {
    // Return every other group that is selected and whose subset includes the role of
    // the selection and also has the same read/write (or a subset of write) access level.
    const roleToCheck = selection.value.roles[0];

    const supersets = selectedGroups
        .filter(group =>
            subsetRelations.some(
                set => set.superset === group.value.roles[0] && set.subsets.includes(roleToCheck)
            ) && (
                group.value.actions === selection.value.actions || group.value.actions === "write"
            ));

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

