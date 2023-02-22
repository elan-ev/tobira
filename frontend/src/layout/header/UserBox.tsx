import React, { KeyboardEvent, ReactNode, ReactElement } from "react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    FiAlertTriangle, FiArrowLeft, FiCheck, FiUserCheck,
    FiChevronDown, FiFolder, FiLogOut, FiUpload,
} from "react-icons/fi";
import { HiOutlineTranslate } from "react-icons/hi";

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
import { FOCUS_STYLE_INSET } from "../../ui";
import { ProtoButton } from "../../ui/Button";
import { FloatingHandle, FloatingContainer, FloatingTrigger, Floating } from "../../ui/Floating";


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

    return <>
        <LanguageSettings />
        {user === "unknown"
            ? <Spinner css={iconCss} />
            : user === "error"
                // TODO: tooltip
                ? <FiAlertTriangle css={iconCss} />
                : user === "none"
                    ? <LoggedOut />
                    : <LoggedIn {...{ t, user }} />
        }
    </>;
};


/** User-related UI in header when the user is NOT logged in. */
const LoggedOut: React.FC = () => {
    const { t } = useTranslation();

    return <>
        <Link
            to={CONFIG.auth.loginLink ?? LOGIN_PATH}
            onClick={() => {
                // Store a redirect link in session storage.
                window.sessionStorage.setItem(REDIRECT_STORAGE_KEY, window.location.href);
            }}
            htmlLink={!!CONFIG.auth.loginLink}
            css={{
                outline: "transparent",
                ":hover, :focus": {
                    "> :first-child": {
                        backgroundColor: "var(--nav-color-dark)",
                        color: "var(--nav-color-bw-contrast)",
                    },
                },
                ":hover > div": {
                    opacity: 1,
                    outline: "2px solid var(--grey80)",
                },
                ":focus > div": {
                    opacity: 1,
                    outline: "2px solid var(--accent-color)",
                },
            }}
        >
            <div css={{
                color: "var(--nav-color-bw-contrast)",
                display: "flex",
                alignItems: "center",
                gap: 8,
                borderRadius: 8,
                padding: "7px 14px",
                backgroundColor: "var(--nav-color)",
                outlineOffset: 1,
                [`@media (max-width: ${BREAKPOINT_MEDIUM}px)`]: {
                    display: "none",
                },
            }}>
                <FiLogOut size={"20px"} />
                {t("user.login")}
            </div>
            {/* Show icon on mobile devices. */}
            <div css={{
                color: "black",
                ...ICON_STYLE,
                [`@media not all and (max-width: ${BREAKPOINT_MEDIUM}px)`]: {
                    display: "none",
                },
            }}>
                <FiLogOut />
            </div>
        </Link>
    </>;
};


type LoggedInProps = {
    user: User;
};

/** User-related UI in header when the user IS logged in. */
const LoggedIn: React.FC<LoggedInProps> = ({ user }) => {
    const { t } = useTranslation();

    return <WithFloatingMenu type="main">
        <div css={{ position: "relative" }}>
            {/* // TODO: Adjust colors and focus style. */}
            <ProtoButton title={t("user.settings")} css={{
                display: "flex",
                alignItems: "center",
                backgroundColor: "white",
                border: "1px solid var(--grey65)",
                gap: 12,
                borderRadius: 8,
                marginRight: 8,
                padding: "8px 14px 8px 20px",
                cursor: "pointer",
                ":hover": { outline: "2px solid var(--grey80)" },
                ":focus": { outline: "2px solid var(--accent-color)" },
                [`@media (max-width: ${BREAKPOINT_MEDIUM}px)`]: {
                    display: "none",
                },
            }}>
                {user.displayName}
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
                <FiUserCheck css={{ polyline: { stroke: "var(--happy-color-dark)" } }}/>
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
            <ReturnButton onClick={() => close()}>{t("User features")}</ReturnButton>
            {isRealUser(user) && <>
                <MenuItem
                    css={{
                        [`@media not all and (max-width: ${BREAKPOINT_MEDIUM}px)`]: {
                            borderRadius: "8px 8px 0 0",
                        },
                    }}
                    icon={<FiFolder />}
                    borderBottom
                    linkTo="/~manage"
                    onClick={() => close()}
                >{t("user.manage-content")}</MenuItem>
                {user.canUpload && <MenuItem
                    icon={<FiUpload />}
                    linkTo={"/~upload"}
                    onClick={() => close()}
                >{t("upload.title")}</MenuItem>}
            </>}

            {/* Logout button if the user is logged in */}
            {isRealUser(user) && <Logout />}
        </>,
        language: () => <>
            <ReturnButton onClick={() => close()}>{t("Choose language")}</ReturnButton>
            <LanguageMenu />
        </>,
    });

    return <Floating borderWidth={0} padding={0}>
        <div
            onClick={e => {
                if (e.target === e.currentTarget) {
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
            }}>
            <ul css={{
                borderRadius: 8,
                zIndex: 1000,
                right: 0,
                margin: 0,
                minWidth: 200,
                paddingLeft: 0,
                overflow: "hidden",
                listStyle: "none",
                [`@media (max-width: ${BREAKPOINT_MEDIUM}px)`]: {
                    backgroundColor: "white",
                    marginTop: 0,
                    position: "fixed",
                    left: 0,
                    top: 0,
                    boxShadow: "none",
                    borderRadius: "0 0 8px 8px",
                },
            }}>{items}</ul>
        </div>
    </Floating>;
};


const LanguageSettings: React.FC = () => {
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
        borderBottom: "1px solid var(--grey80)",
        display: "flex",
        [`@media not all and (max-width: ${BREAKPOINT_MEDIUM}px)`]: {
            display: "none",
        },
    }}>
        <div onClick={onClick} tabIndex={0} css={{
            cursor: "pointer",
            padding: "24px 12px",
            ":hover, :focus": {
                backgroundColor: "var(--grey80)",
            },
            ":focus": {
                outline: "none",
                boxShadow: "inset 0 0 0 2px var(--accent-color)",
            },
            "> svg": {
                position: "relative",
                top: 1,
                maxHeight: 23,
                fontSize: 23,
                width: 24,
                strokeWidth: 2,
            },
            "+ span": {
                color: "var(--grey40)",
                padding: "24px 12px 24px 4px",
            },
        }}>
            <FiArrowLeft />
        </div>
        <span>{children}</span>
    </div>
);

/** Entries in the menu related to language. */
const LanguageMenu: React.FC = () => {
    const { t, i18n } = useTranslation();
    const isCurrentLanguage = (language: string) => language === i18n.resolvedLanguage;

    return <>
        {Object.keys(languages).map(lng => (
            <MenuItem
                key={lng}
                icon={isCurrentLanguage(lng) ? <FiCheck /> : undefined}
                onClick={() => i18n.changeLanguage(lng)}
                css={{
                    backgroundColor: "var(--grey92)",
                    borderRadius: 4,
                    margin: 8,
                    ":hover, :focus": {
                        backgroundColor: "var(--grey80)",
                    },
                    ...isCurrentLanguage(lng) && {
                        backgroundColor: "var(--grey80)",
                    },
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
}) => {
    const inner = <>
        {icon ?? <svg />}
        <div>{children}</div>
    </>;
    /* // TODO: Adjust colors and focus-style. */
    const css = {
        display: "flex",
        gap: 16,
        alignItems: "center",
        padding: "12px",
        cursor: "pointer",
        whiteSpace: "nowrap",
        color: "black",
        ...borderBottom && {
            borderBottom: "1px solid var(--grey80)",
        },
        ...borderTop && {
            borderTop: "1px solid var(--grey80)",
        },
        "& > svg": {
            maxHeight: 23,
            fontSize: 23,
            width: 24,
            strokeWidth: 2,
            "& > path": {
                strokeWidth: "inherit",
            },
        },
        "&:hover, &:focus": {
            backgroundColor: "var(--grey92)",
        },
        "&:focus": {
            boxShadow: "inset 0 0 0 2px var(--accent-color)",
        },
        ...FOCUS_STYLE_INSET,
    } as const;


    // One should be able to use the menu with keyboard only. So if the item is
    // focussed, pressing enter should have the same effect as clicking it.
    // Thats already true automatically for links.
    const onKeyDown = (e: KeyboardEvent<HTMLLIElement>) => {
        if (document.activeElement === e.currentTarget && e.key === "Enter") {
            onClick();
        }
    };

    return linkTo
        ? <li role="menuitem" {... { className }}>
            <Link to={linkTo} css={css} {...{ htmlLink, onClick, className }}>{inner}</Link>
        </li>
        : <li role="menuitem" tabIndex={0} css={css} {...{ onClick, className, onKeyDown }}>
            {inner}
        </li>;
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
                color: "var(--danger-color)",
                ":hover, :focus": {
                    borderRadius: "0 0 8px 8px",
                },
            }}
            {...actionProps}
        >{t("user.logout")}</MenuItem>
    );
};
