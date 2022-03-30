import { TFunction } from "i18next";
import React, { MutableRefObject, KeyboardEvent } from "react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    FiAlertTriangle,
    FiCheck, FiChevronLeft, FiFilm, FiLogIn, FiLogOut,
    FiMoreVertical, FiUpload, FiUserCheck,
} from "react-icons/fi";
import { HiOutlineTranslate } from "react-icons/hi";

import { SMALLER_FONT_BREAKPOINT } from "../../GlobalStyle";
import { languages } from "../../i18n";
import { Link } from "../../router";
import { useOnOutsideClick } from "../../util";
import { User, useUser } from "../../User";
import { match } from "../../util";
import { ActionIcon } from "./ui";
import CONFIG from "../../config";
import { Spinner } from "../../ui/Spinner";
import { LOGIN_PATH } from "../../routes/paths";
import { REDIRECT_STORAGE_KEY } from "../../routes/Login";
import { FOCUS_STYLE_INSET } from "../../ui";


/** Viewport width in pixels where the user UI switches between narrow and wide */
const BREAKPOINT = 650;

/** User-related UI in the header. */
export const UserBox: React.FC = () => {
    const { t } = useTranslation();
    const user = useUser();

    const [menuOpen, setMenuOpen] = useState(false);
    const menu = {
        isOpen: menuOpen,
        toggle: () => setMenuOpen(old => !old),
        close: () => setMenuOpen(false),
    };

    if (user === "unknown") {
        return <Spinner css={{
            height: "100%",
            margin: "0 9px",
            fontSize: 22,
            opacity: 0.4,
        }} />;
    } else if (user === "none") {
        return <LoggedOut {...{ t, menu }} />;
    } else {
        return <LoggedIn {...{ t, user, menu }} />;
    }
};

type Menu = {
    isOpen: boolean;
    toggle: () => void;
    close: () => void;
};

type LoggedOutProps = {
    t: TFunction;
    menu: Menu;
};

/** User-related UI in header when the user is NOT logged in. */
const LoggedOut: React.FC<LoggedOutProps> = ({ t, menu }) => {
    const ref = useRef(null);

    return (
        <div ref={ref} css={{ display: "flex" }}>
            <Link
                to={CONFIG.auth.loginLink ?? LOGIN_PATH}
                onClick={() => {
                    // If we are linking to our internal login page, store a
                    // redirect link in session storage.
                    if (!CONFIG.auth.loginLink) {
                        window.sessionStorage.setItem(REDIRECT_STORAGE_KEY, window.location.href);
                    }
                }}
                htmlLink={!!CONFIG.auth.loginLink}
                css={{
                    alignSelf: "center",
                    borderRadius: 10,
                    cursor: "pointer",
                    padding: "5px 14px",
                    marginRight: 8,
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    backgroundColor: "var(--nav-color)",
                    color: "white",
                    "&:hover": {
                        backgroundColor: "var(--nav-color-dark)",
                        color: "white",
                    },
                    "&:focus-visible": {
                        outline: "none",
                        boxShadow: "0 0 0 2px black",
                    },
                    [`@media (max-width: ${BREAKPOINT}px)`]: {
                        display: "none",
                    },
                }}
            ><FiLogIn />{t("user.login")}</Link>
            <UserSettingsIcon t={t} onClick={menu.toggle} />
            {menu.isOpen && <Menu close={menu.close} t={t} container={ref} />}
        </div>
    );
};


type LoggedInProps = {
    t: TFunction;
    user: User;
    menu: Menu;
};

/** User-related UI in header when the user IS logged in. */
const LoggedIn: React.FC<LoggedInProps> = ({ t, user, menu }) => {
    const ref = useRef(null);

    return (
        <div ref={ref} css={{ position: "relative" }}>
            <div onClick={menu.toggle} css={{
                height: "100%",
                alignSelf: "center",
                display: "flex",
                cursor: "pointer",
                "&:hover": {
                    "& div": { opacity: 1 },
                },
            }}>
                {/* Show name of user on large screens */}
                <div css={{
                    maxWidth: 240,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    lineHeight: 1.3,
                    paddingRight: 16,
                    opacity: 0.75,
                    [`@media (max-width: ${BREAKPOINT}px)`]: {
                        display: "none",
                    },
                }}>
                    <div css={{ fontSize: 12, color: "var(--grey40)" }}>
                        {t("user.logged-in-as")}
                    </div>
                    <div css={{
                        flex: "0 1 auto",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                    }}>{user.displayName}</div>
                </div>

                {/* Show icon */}
                <ActionIcon title={t("user.settings")}>
                    <FiUserCheck css={{ "& > polyline": { stroke: "var(--happy-color-dark)" } }}/>
                </ActionIcon>
            </div>

            {/* Show menu if it is opened */}
            {menu.isOpen && <Menu close={menu.close} t={t} container={ref} />}
        </div>
    );
};


type UserSettingsIconProps = {
    t: TFunction;
    onClick: () => void;
};

const UserSettingsIcon: React.FC<UserSettingsIconProps> = ({ t, onClick }) => (
    <ActionIcon title={t("user.settings")} onClick={onClick}>
        <FiMoreVertical css={{
            fontSize: 26,
            [`@media (max-width: ${SMALLER_FONT_BREAKPOINT}px)`]: {
                fontSize: 22,
            },
        }} />
    </ActionIcon>
);


type MenuProps = {
    t: TFunction;
    close: () => void;
    container: MutableRefObject<Node | null>;
};

/**
 * A menu with some user-related settings/actions that floats on top of the page
 * and closes itself on click outside of it.
 */
const Menu: React.FC<MenuProps> = ({ t, close, container }) => {
    type State = "main" | "language";
    const [state, setState] = useState<State>("main");

    const userState = useUser();
    const user = userState === "none" || userState === "unknown" ? null : userState;

    // Close menu on clicks anywhere outside of it.
    useOnOutsideClick(container, close);

    const items = match(state, {
        main: () => <>
            {/* Login button if the user is NOT logged in */}
            {!user && (
                <MenuItem
                    icon={<FiLogIn />}
                    borderBottom
                    linkTo={CONFIG.auth.loginLink ?? LOGIN_PATH}
                    htmlLink={!!CONFIG.auth.loginLink}
                    css={{
                        color: "var(--nav-color)",
                        [`@media not all and (max-width: ${BREAKPOINT}px)`]: {
                            display: "none",
                        },
                    }}
                >{t("user.login")}</MenuItem>
            )}

            {user && <>
                {user.canUpload && <MenuItem
                    icon={<FiUpload />}
                    linkTo={"/~upload"}
                    onClick={() => close()}
                >{t("upload.title")}</MenuItem>}
                <MenuItem
                    icon={<FiFilm />}
                    linkTo="/~manage"
                    onClick={() => close()}
                >{t("user.manage-content")}</MenuItem>
            </>}

            <MenuItem icon={<HiOutlineTranslate />} onClick={() => setState("language")}>
                {t("language")}
            </MenuItem>

            {/* Logout button if the user is logged in */}
            {user && <Logout />}
        </>,
        language: () => <>
            <MenuItem icon={<FiChevronLeft />} onClick={() => setState("main")} borderBottom>
                {t("back")}
            </MenuItem>
            <LanguageMenu />
        </>,
    });

    return (
        <ul css={{
            position: "absolute",
            zIndex: 1000,
            top: "100%",
            right: 8,
            marginTop: 8,
            borderRadius: 4,
            border: "1px solid var(--grey80)",
            boxShadow: "1px 1px 5px var(--grey92)",
            backgroundColor: "white",
            minWidth: 200,
            paddingLeft: 0,
            margin: 0,
            overflow: "hidden",
        }}>{items}</ul>
    );
};

/** Entries in the menu related to language. */
const LanguageMenu: React.FC = () => {
    const { t, i18n } = useTranslation();

    return <>
        {Object.keys(languages).map(lng => (
            <MenuItem
                key={lng}
                icon={lng === i18n.resolvedLanguage ? <FiCheck /> : undefined}
                onClick={() => i18n.changeLanguage(lng)}
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
    const css = {
        display: "flex",
        gap: 16,
        alignItems: "center",
        height: 40,
        paddingLeft: "12px",
        paddingRight: "16px",
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
            fontSize: 22,
            width: 24,
            strokeWidth: 1.5,
            "& > path": {
                strokeWidth: "inherit",
            },
        },
        "&:hover": {
            backgroundColor: "var(--grey97)",
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
        ? <li {... { className }}>
            <Link to={linkTo} css={css} {...{ htmlLink, onClick, className }}>{inner}</Link>
        </li>
        : <li tabIndex={0} css={css} {...{ onClick, className, onKeyDown }}>
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
                        // is not very great for the uesr.
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
            css={{ color: "var(--danger-color)" }}
            {...actionProps}
        >{t("user.logout")}</MenuItem>
    );
};
