import React, { KeyboardEvent, ReactNode, ReactElement } from "react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    FiAlertTriangle, FiArrowLeft, FiCheck, FiUserCheck, FiChevronDown,
    FiFolder, FiLogOut, FiUpload, FiLogIn, FiFilm, FiVideo,
} from "react-icons/fi";
import { HiOutlineFire, HiOutlineTranslate } from "react-icons/hi";

import { BREAKPOINT_MEDIUM } from "../../GlobalStyle";
import { languages } from "../../i18n";
import { Link } from "../../router";
import { isRealUser, User, useUser } from "../../User";
import { match } from "../../util";
import { ActionIcon, ICON_STYLE } from "./ui";
import CONFIG from "../../config";
import { Spinner } from "../../ui/Spinner";
import { LOGIN_PATH } from "../../routes/paths";
import { REDIRECT_STORAGE_KEY } from "../../routes/Login";
import { focusStyle } from "../../ui";
import { ProtoButton } from "../../ui/Button";
import { FloatingHandle, FloatingContainer, FloatingTrigger, Floating } from "../../ui/Floating";
import { ExternalLink, ExternalLinkProps } from "../../relay/auth";
import { COLORS } from "../../color";


/** User-related UI in the header. */
export const UserBox: React.FC = () => {
    const { t } = useTranslation();
    const user = useUser();

    const iconCss = {
        height: "100%",
        margin: "0 9px",
        fontSize: 22,
        opacity: 0.4,
    };

    let boxContent;
    if (user === "unknown") {
        boxContent = <Spinner css={iconCss} />;
    } else if (user === "error") {
        // TODO: tooltip
        boxContent = <FiAlertTriangle css={iconCss} />;
    } else if (user === "none") {
        boxContent = <LoggedOut />;
    } else {
        boxContent = <LoggedIn {...{ t, user }} />;
    }

    return <>
        <LanguageSettings />
        {boxContent}
    </>;
};


/** User-related UI in header when the user is NOT logged in. */
const LoggedOut: React.FC = () => {
    const { t } = useTranslation();

    return (
        <Link
            to={CONFIG.auth.loginLink ?? LOGIN_PATH}
            onClick={() => {
                // Store a redirect link in session storage.
                window.sessionStorage.setItem(REDIRECT_STORAGE_KEY, window.location.href);
            }}
            htmlLink={!!CONFIG.auth.loginLink}
            css={{
                /* Show labelled button on larger screens. */
                [`@media not all and (max-width: ${BREAKPOINT_MEDIUM}px)`]: {
                    color: COLORS.primary0BwInverted,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginLeft: 4,
                    borderRadius: 8,
                    padding: "7px 14px",
                    backgroundColor: COLORS.primary0,
                    svg: { fontSize: 20 },
                    ":hover, :focus": {
                        backgroundColor: COLORS.primary1,
                        color: COLORS.primary1BwInverted,
                    },
                    ...focusStyle({ offset: 1 }),
                },
                /* Show only the icon on mobile devices. */
                [`@media (max-width: ${BREAKPOINT_MEDIUM}px)`]: {
                    color: "black",
                    ...ICON_STYLE,
                    span: { display: "none" },
                },
            }}
        >
            <FiLogIn />
            <span>{t("user.login")}</span>
        </Link>
    );
};


type LoggedInProps = {
    user: User;
};

/** User-related UI in header when the user IS logged in. */
const LoggedIn: React.FC<LoggedInProps> = ({ user }) => {
    const { t } = useTranslation();

    return <WithFloatingMenu type="main">
        <div css={{ position: "relative" }}>
            <ProtoButton title={t("user.settings")} css={{
                display: "flex",
                alignItems: "center",
                backgroundColor: "white",
                border: `1px solid ${COLORS.grey5}`,
                gap: 12,
                borderRadius: 8,
                padding: "8px 10px 8px 16px",
                cursor: "pointer",
                ":hover": {
                    borderColor: COLORS.grey4,
                    outline: `2.5px solid ${COLORS.grey4}`,
                    outlineOffset: -1,
                },
                ":focus-visible": { borderColor: COLORS.focus },
                ...focusStyle({ offset: -1 }),
                [`@media (max-width: ${BREAKPOINT_MEDIUM}px)`]: {
                    display: "none",
                },
            }}>
                <span css={{
                    maxWidth: "clamp(170px, 12vw, 230px)",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                    overflow: "hidden",
                }}>
                    {user.displayName}
                </span>
                <FiChevronDown size={20}/>
            </ProtoButton>
            {/* Show icon on mobile devices. */}
            <ActionIcon
                title={t("user.settings")}
                css={{
                    [`@media not all and (max-width: ${BREAKPOINT_MEDIUM}px)`]: {
                        display: "none",
                    },
                }}>
                <FiUserCheck css={{ polyline: { stroke: COLORS.happy1 } }}/>
            </ActionIcon>
        </div>
    </WithFloatingMenu>;
};


type MenuType = "main" | "language";

type WithFloatingMenuProps = {
    children: ReactElement;
    type: MenuType;
};

const WithFloatingMenu: React.FC<WithFloatingMenuProps> = ({ children, type }) => {
    const ref = useRef<FloatingHandle>(null);

    return (
        <FloatingContainer
            ref={ref}
            placement="bottom"
            trigger="click"
            ariaRole="menu"
            arrowSize={12}
            viewPortMargin={12}
            borderRadius={8}
            distance={5}
        >
            <FloatingTrigger>{children}</FloatingTrigger>
            <FloatingMenu close={() => ref.current?.close()} type={type} />
        </FloatingContainer>
    );
};

type FloatingMenuProps = {
    close: () => void;
    type: MenuType;
};

/**
 * A menu with some user-related settings/actions that floats on top of the page
 * and closes itself on click outside of it.
 */
const FloatingMenu: React.FC<FloatingMenuProps> = ({ close, type }) => {
    const { t } = useTranslation();
    const user = useUser();

    const items = match(type, {
        main: () => <>
            {isRealUser(user) && <>
                <ReturnButton onClick={close}>{user.displayName}</ReturnButton>
                <MenuItem
                    icon={<FiFolder />}
                    borderBottom
                    linkTo="/~manage"
                    onClick={close}
                >{t("user.manage-content")}</MenuItem>
                {user.canCreateUserRealm && <MenuItem
                    icon={<HiOutlineFire />}
                    borderBottom
                    indent
                    linkTo={`/@${user.username}`}
                    onClick={close}
                >{t("realm.user-realm.your-page")}</MenuItem>}
                {<MenuItem
                    icon={<FiFilm />}
                    borderBottom
                    indent
                    linkTo={"/~manage/videos"}
                    onClick={close}
                >{t("manage.my-videos.title")}</MenuItem>}
                {user.canUpload && <MenuItem
                    icon={<FiUpload />}
                    borderBottom
                    indent
                    linkTo={"/~manage/upload"}
                    onClick={close}
                >{t("upload.title")}</MenuItem>}
                {user.canUseStudio && <MenuItem
                    icon={<FiVideo />}
                    indent
                    onClick={close}
                    externalLinkProps={{
                        service: "STUDIO",
                        params: { "return.target": new URL(document.location.href) },
                        fallback: "link",
                    }}
                >{t("manage.dashboard.studio-tile-title")}</MenuItem>}
            </>}

            {/* Logout button if the user is logged in */}
            {isRealUser(user) && <Logout />}
        </>,
        language: () => <>
            <ReturnButton onClick={close}>{t("language")}</ReturnButton>
            <LanguageMenu close={close} />
        </>,
    });

    return (
        <Floating
            borderWidth={0}
            padding={0}
            shadowBlur={8}
        >
            <div
                onClick={e => {
                    if (e.target === e.currentTarget) {
                        close();
                    }
                }}
                onBlur={e => {
                    if (!e.currentTarget.contains(e.relatedTarget)) {
                        close();
                    }
                }}
                css={{
                    position: "relative",
                    // Grey out background on mobile devices.
                    [`@media (max-width: ${BREAKPOINT_MEDIUM}px)`]: {
                        position: "fixed",
                        top: "var(--header-height)",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        zIndex: 1001,
                        backgroundColor: "#000000a0",
                    },
                }}
            >
                <ul css={{
                    borderRadius: 8,
                    right: 0,
                    margin: 0,
                    paddingLeft: 0,
                    overflow: "hidden",
                    listStyle: "none",
                    li: {
                        ":first-of-type, :first-of-type > a": { borderRadius: "8px 8px 0 0" },
                        ":last-of-type": { borderRadius: "0 0 8px 8px" },
                    },
                    [`@media (max-width: ${BREAKPOINT_MEDIUM}px)`]: {
                        backgroundColor: "white",
                        borderRadius: "0 0 8px 8px",
                        marginTop: 0,
                        position: "fixed",
                        left: 0,
                        top: 0,
                        li: { ":first-of-type, :first-of-type > a": { borderRadius: 0 } },
                    },
                }}>{items}</ul>
            </div>
        </Floating>
    );
};


export const LanguageSettings: React.FC = () => {
    const { t } = useTranslation();

    return <WithFloatingMenu type="language">
        <ActionIcon title={t("language")}>
            <HiOutlineTranslate />
        </ActionIcon>
    </WithFloatingMenu>;
};


type ReturnButtonProps = {
    onClick: () => void;
    children: ReactNode;
};

const ReturnButton: React.FC<ReturnButtonProps> = ({ onClick, children }) => (
    <div css={{
        borderBottom: `1px solid ${COLORS.grey5}`,
        display: "flex",
        [`@media not all and (max-width: ${BREAKPOINT_MEDIUM}px)`]: {
            display: "none",
        },
    }}>
        <ProtoButton onClick={onClick} tabIndex={0} css={{
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            padding: "24px 12px",
            opacity: 0.75,
            ":hover, :focus": { opacity: 1 },
            ...focusStyle({ inset: true }),
            "> svg": {
                maxHeight: 23,
                fontSize: 23,
                width: 24,
                strokeWidth: 2,
            },
        }}>
            <FiArrowLeft />
        </ProtoButton>
        <span css={{
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
            overflow: "hidden",
            color: COLORS.grey6,
            padding: "24px 12px 24px 4px",
        }}>{children}</span>
    </div>
);

/** Entries in the menu related to language. */
const LanguageMenu: React.FC<{ close: () => void }> = ({ close }) => {
    const { t, i18n } = useTranslation();
    const isCurrentLanguage = (language: string) => language === i18n.resolvedLanguage;

    return <>
        {Object.keys(languages).map(lng => (
            <MenuItem
                key={lng}
                icon={isCurrentLanguage(lng) ? <FiCheck /> : undefined}
                onClick={() => {
                    if (!isCurrentLanguage(lng)) {
                        close();
                        i18n.changeLanguage(lng);
                    }
                }}
                css={{
                    minWidth: 160,
                    ...isCurrentLanguage(lng) && { cursor: "default" },
                    ":not(:last-child)": { borderBottom: `1px solid ${COLORS.grey4}` },
                }}
            >{t("language-name", { lng })}</MenuItem>
        ))}
    </>;

};

type MenuItemProps = {
    icon?: JSX.Element;
    onClick?: () => void;
    linkTo?: string;
    className?: string;
    htmlLink?: boolean;
    borderBottom?: boolean;
    borderTop?: boolean;
    indent?: boolean;
    externalLinkProps?: ExternalLinkProps;
    children: ReactNode;
};

/** A single item in the user menu. */
const MenuItem: React.FC<MenuItemProps> = ({
    icon,
    children,
    linkTo,
    onClick = () => {},
    className,
    htmlLink = false,
    borderBottom = false,
    borderTop = false,
    indent = false,
    externalLinkProps,
}) => {
    const inner = <>
        {icon ?? <svg />}
        <div>{children}</div>
    </>;
    const css = {
        display: "flex",
        gap: 16,
        alignItems: "center",
        minWidth: 200,
        padding: 12,
        ...indent && { paddingLeft: 30 },
        cursor: "pointer",
        whiteSpace: "nowrap",
        color: "black",
        ...borderBottom && { borderBottom: `1px solid ${COLORS.grey4}` },
        ...borderTop && { borderTop: `1px solid ${COLORS.grey4}` },
        "& > svg": {
            maxHeight: 23,
            fontSize: 23,
            width: 24,
            strokeWidth: 2,
            "& > path": { strokeWidth: "inherit" },
        },
        ":hover, :focus": { backgroundColor: COLORS.grey0 },
        ...focusStyle({ inset: true }),
    } as const;


    // One should be able to use the menu with keyboard only. So if the item is
    // focussed, pressing enter should have the same effect as clicking it.
    // Thats already true automatically for links.
    const onKeyDown = (e: KeyboardEvent<HTMLLIElement>) => {
        if (document.activeElement === e.currentTarget && e.key === "Enter") {
            onClick();
        }
    };

    let menuItem;
    if (linkTo) {
        menuItem = <li role="menuitem" {... { className }}>
            <Link to={linkTo} css={css} {...{ htmlLink, onClick, className }}>{inner}</Link>
        </li>;
    } else if (externalLinkProps) {
        menuItem = <li role="menuitem">
            <ExternalLink
                {...externalLinkProps}
                css={{
                    backgroundColor: "transparent",
                    border: "none",
                    ...css,
                    minWidth: "100%",
                }}
            >{inner}</ExternalLink>
        </li>;
    } else {
        menuItem = (
            <li
                role="menuitem"
                tabIndex={0}
                css={css}
                {...{ onClick, className, onKeyDown }}
            >{inner}</li>
        );
    }

    return menuItem;
};


const Logout: React.FC = () => {
    const { t } = useTranslation();

    type State = "idle" | "pending" | "error";
    const [state, setState] = useState<State>("idle");

    const actionProps = CONFIG.auth.logoutLink !== null
        // Just a normal link to the specified URL
        ? {
            htmlLink: true,
            linkTo: CONFIG.auth.logoutLink,
        }
        // Our own internal link
        : {
            onClick: () => {
                // We don't do anything if a request is already pending.
                if (state === "pending") {
                    return;
                }

                setState("pending");
                fetch("/~session", { method: "DELETE" })
                    .then(() => {
                        // We deliberately ignore the `status`. See `handle_logout`
                        // for more information.
                        //
                        // We hard forward to the home page to get rid of any stale state.
                        window.location.href = "/";
                    })
                    .catch(error => {
                        // TODO: this is not great. It should happen only
                        // extremely rarely, but still, just showing a triangle
                        // is not very great for the user.
                        // eslint-disable-next-line no-console
                        console.error("Error during logout: ", error);
                        setState("error");
                    });
            },
        };

    return (
        <MenuItem
            icon={match(state, {
                "idle": () => <FiLogOut />,
                "pending": () => <Spinner />,
                "error": () => <FiAlertTriangle />,
            })}
            borderTop
            css={{
                color: COLORS.danger0,
            }}
            {...actionProps}
        >{t("user.logout")}</MenuItem>
    );
};
