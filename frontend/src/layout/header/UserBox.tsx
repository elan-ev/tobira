import React, { KeyboardEvent, ReactNode, ReactElement, useRef } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    FiAlertTriangle,
    FiCheck, FiChevronLeft, FiFilm, FiLogIn, FiLogOut,
    FiMoreVertical, FiUpload, FiUserCheck,
} from "react-icons/fi";
import { HiOutlineTranslate } from "react-icons/hi";

import { BREAKPOINT_SMALL, BREAKPOINT_MEDIUM } from "../../GlobalStyle";
import { languages } from "../../i18n";
import { Link } from "../../router";
import { isRealUser, User, useUser } from "../../User";
import { match } from "../../util";
import { ActionIcon } from "./ui";
import CONFIG from "../../config";
import { Spinner } from "../../ui/Spinner";
import { LOGIN_PATH } from "../../routes/paths";
import { REDIRECT_STORAGE_KEY } from "../../routes/Login";
import { FOCUS_STYLE_INSET } from "../../ui";
import { Floating, FloatingContainer, FloatingHandle, FloatingTrigger } from "../../ui/Floating";


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
    if (user === "unknown") {
        return <Spinner css={iconCss} />;
    } else if (user === "error") {
        // TODO: tooltip
        return <FiAlertTriangle css={iconCss} />;
    } else if (user === "none") {
        return <LoggedOut />;
    } else {
        return <LoggedIn {...{ t, user }} />;
    }
};


/** User-related UI in header when the user is NOT logged in. */
const LoggedOut: React.FC = () => {
    const { t } = useTranslation();

    return (
        <div css={{ display: "flex", padding: "8px 0" }}>
            <Link
                to={CONFIG.auth.loginLink ?? LOGIN_PATH}
                onClick={() => {
                    // Store a redirect link in session storage.
                    window.sessionStorage.setItem(REDIRECT_STORAGE_KEY, window.location.href);
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
                    color: "var(--nav-color-bw-contrast)",
                    "&:hover, &:focus": {
                        backgroundColor: "var(--nav-color-dark)",
                        color: "var(--nav-color-bw-contrast)",
                    },
                    "&:focus-visible": {
                        outline: "none",
                        boxShadow: "0 0 0 2px black",
                    },
                    [`@media (max-width: ${BREAKPOINT_MEDIUM}px)`]: {
                        display: "none",
                    },
                }}
            ><FiLogIn />{t("user.login")}</Link>
            <WithFloatingMenu>
                <ActionIcon title={t("user.settings")}>
                    <FiMoreVertical css={{
                        fontSize: 26,
                        [`@media (max-width: ${BREAKPOINT_SMALL}px)`]: {
                            fontSize: 22,
                        },
                    }} />
                </ActionIcon>
            </WithFloatingMenu>
        </div>
    );
};

const WithFloatingMenu: React.FC<{ children: ReactElement }> = ({ children }) => {
    const ref = useRef<FloatingHandle>(null);

    return (
        <FloatingContainer
            ref={ref}
            placement="bottom"
            trigger="click"
            arrowSize={12}
            distance={0}
            viewPortMargin={12}
        >
            <FloatingMenu close={() => ref.current?.close()} />
            <FloatingTrigger>{children}</FloatingTrigger>
        </FloatingContainer>
    );
};

type LoggedInProps = {
    user: User;
};

/** User-related UI in header when the user IS logged in. */
const LoggedIn: React.FC<LoggedInProps> = ({ user }) => {
    const { t } = useTranslation();

    return (
        <WithFloatingMenu>
            <div css={{
                height: "100%",
                padding: "8px 0",
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
                    [`@media (max-width: ${BREAKPOINT_MEDIUM}px)`]: {
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
        </WithFloatingMenu>
    );
};


/**
 * A menu with some user-related settings/actions that floats on top of the page
 * and closes itself on click outside of it.
 */
const FloatingMenu: React.FC<{ close: () => void }> = ({ close }) => {
    const { t } = useTranslation();

    type State = "main" | "language";
    const [state, setState] = useState<State>("main");

    const user = useUser();

    const items = match(state, {
        main: () => <>
            {/* Login button if the user is NOT logged in */}
            {user === "none" && (
                <MenuItem
                    icon={<FiLogIn />}
                    borderBottom
                    linkTo={CONFIG.auth.loginLink ?? LOGIN_PATH}
                    htmlLink={!!CONFIG.auth.loginLink}
                    css={{
                        color: "var(--nav-color)",
                        [`@media not all and (max-width: ${BREAKPOINT_MEDIUM}px)`]: {
                            display: "none",
                        },
                    }}
                >{t("user.login")}</MenuItem>
            )}

            {isRealUser(user) && <>
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
            {isRealUser(user) && <Logout />}
        </>,
        language: () => <>
            <MenuItem icon={<FiChevronLeft />} onClick={() => setState("main")} borderBottom>
                {t("back")}
            </MenuItem>
            <LanguageMenu />
        </>,
    });

    return (
        <Floating padding={0}>
            <ul css={{
                listStyle: "none",
                margin: 0,
                paddingLeft: 0,
                minWidth: 200,
            }}>{items}</ul>
        </Floating>
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
        "&:hover, &:focus": {
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
