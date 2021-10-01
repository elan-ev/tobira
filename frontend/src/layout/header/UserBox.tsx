import { Interpolation, Theme } from "@emotion/react";
import { TFunction } from "i18next";
import React from "react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    FiCheck, FiChevronDown, FiChevronLeft, FiLogIn, FiLogOut, FiMoon, FiMoreVertical, FiUser,
} from "react-icons/fi";
import { HiOutlineTranslate } from "react-icons/hi";

import { SMALLER_FONT_BREAKPOINT } from "../../GlobalStyle";
import { languages } from "../../i18n";
import { useOnOutsideClick } from "../../routes/manage/Realm/util";
import { User, useUser } from "../../User";
import { match } from "../../util";
import { ActionIcon } from "./ui";


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
        return null;
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

const BOX_CSS = {
    border: "1px solid var(--grey80)",
    alignSelf: "center",
    borderRadius: 4,
    cursor: "pointer",
} as const;


type LoggedOutProps = {
    t: TFunction;
    menu: Menu;
};

/** User-related UI in header when the user is NOT logged in. */
const LoggedOut: React.FC<LoggedOutProps> = ({ t, menu }) => (
    <div css={{ display: "flex" }}>
        <div css={{
            ...BOX_CSS,
            padding: "3px 8px",
            marginRight: 8,
            display: "flex",
            gap: 8,
            alignItems: "center",
            color: "var(--nav-color)",
            "&:hover": {
                boxShadow: "1px 1px 5px var(--grey92)",
            },
            [`@media (max-width: ${BREAKPOINT}px)`]: {
                display: "none",
            },
        }}>
            <FiLogIn />
            {t("user.login")}
        </div>
        <UserSettingsIcon t={t} onClick={menu.toggle} />
        {menu.isOpen && <Menu close={menu.close} t={t} />}
    </div>
);


type LoggedInProps = {
    t: TFunction;
    user: User;
    menu: Menu;
};

/** User-related UI in header when the user IS logged in. */
const LoggedIn: React.FC<LoggedInProps> = ({ t, user, menu }) => (
    <div css={{
        alignSelf: "center",
        marginRight: 8,

        // For wide screens, we show the user display name and a box to click
        // on. In that case, the box should be what the menu will be relative
        // to. Otherwise, the next "relative" thing is the icon box.
        [`@media not all and (max-width: ${BREAKPOINT}px)`]: {
            position: "relative",
        },
    }}>
        {/* Show name in box for large screens */}
        <div
            title={t("user.settings")}
            onClick={menu.toggle}
            css={{
                ...BOX_CSS,
                display: "flex",
                position: "relative",
                alignItems: "center",
                gap: 8,
                maxWidth: 240,
                padding: "3px 3px 3px 10px",
                ...menu.isOpen && {
                    borderBottomLeftRadius: 0,
                    borderBottomRightRadius: 0,
                    boxShadow: "1px 1px 5px var(--grey92)",
                },
                "& > svg": {
                    opacity: 0.75,
                },
                "&:hover": {
                    boxShadow: "1px 1px 5px var(--grey92)",
                    "& > svg": {
                        opacity: 1,
                    },
                },
                [`@media (max-width: ${BREAKPOINT}px)`]: {
                    display: "none",
                },
            }}
        >
            <div css={{
                flex: "0 1 auto",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                overflow: "hidden",
            }}>{user.displayName}</div>
            <FiChevronDown css={{ fontSize: 28, minWidth: 28 }} />
        </div>

        {/* Only show icon for small screens */}
        {/* TODO: find a way to signal the user is logged in */}
        <ActionIcon
            title={t("user.settings")}
            onClick={menu.toggle}
            extraCss={{
                [`@media not all and (max-width: ${BREAKPOINT}px)`]: {
                    display: "none",
                },
            }}
        >
            <FiUser />
        </ActionIcon>

        {/* Show menu if it is opened */}
        {menu.isOpen && <Menu close={menu.close} t={t} extraCss={{
            // On large screens, we want the menu to snuggle against the user
            // box above. So we have to override a few properties here.
            [`@media not all and (max-width: ${BREAKPOINT}px)`]: {
                right: 0,
                left: 0,
                marginTop: 0,
                borderRadius: "0 0 4px 4px",
                clipPath: "inset(0px -15px -15px -15px)",
            },
        }} />}
    </div>
);


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
    extraCss?: Interpolation<Theme>;
    close: () => void;
};

/**
 * A menu with some user-related settings/actions that floats on top of the page
 * and closes itself on click outside of it.
 */
const Menu: React.FC<MenuProps> = ({ t, close, extraCss = {} }) => {
    type State = "main" | "language";
    const [state, setState] = useState<State>("main");

    const userState = useUser();
    const user = userState === "none" || userState === "unknown" ? null : userState;

    // Close menu on clicks anywhere outside of it.
    const ref = useRef(null);
    useOnOutsideClick(ref, close);

    const items = match(state, {
        main: () => <>
            {/* Login button if the user is NOT logged in */}
            {!user && <MenuItem icon={<FiLogIn />} borderBottom extraCss={{
                color: "var(--nav-color)",
                [`@media not all and (max-width: ${BREAKPOINT}px)`]: {
                    display: "none",
                },
            }}>{t("user.login")}</MenuItem>}

            <MenuItem icon={<HiOutlineTranslate />} onClick={() => setState("language")}>
                {t("language")}
            </MenuItem>
            {/* TODO: make this do something */}
            <MenuItem icon={<FiMoon />}>{t("main-menu.theme")}</MenuItem>

            {/* Logout button if the user is logged in */}
            {user && <MenuItem
                icon={<FiLogOut />}
                borderTop
                extraCss={{ color: "var(--danger-color)" }}
            >{t("user.logout")}</MenuItem>}
        </>,
        language: () => <>
            <MenuItem icon={<FiChevronLeft />} onClick={() => setState("main")} borderBottom>
                {t("back")}
            </MenuItem>
            <LanguageMenu />
        </>,
    });

    return (
        <ul ref={ref} css={{
            position: "absolute",
            top: "100%",
            right: 8,
            marginTop: 8,
            borderRadius: 4,
            border: "1px solid var(--grey80)",
            boxShadow: "1px 1px 5px var(--grey92)",
            backgroundColor: "white",
            minWidth: 220,
            paddingLeft: 0,
            margin: 0,
            overflow: "hidden",
            ...(extraCss as Record<string, unknown>),
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
    extraCss?: Interpolation<Theme>;
    borderBottom?: boolean;
    borderTop?: boolean;
};

/** A single item in the user menu. */
const MenuItem: React.FC<MenuItemProps> = ({
    icon,
    children,
    onClick,
    extraCss = {},
    borderBottom = false,
    borderTop = false,
}) => (
    <li
        onClick={onClick ?? (() => {})}
        css={{
            display: "flex",
            gap: 16,
            alignItems: "center",
            height: 40,
            paddingLeft: "12px",
            paddingRight: "16px",
            cursor: "pointer",
            whiteSpace: "nowrap",
            ...borderBottom && {
                borderBottom: "1px solid var(--grey80)",
            },
            ...borderTop && {
                borderTop: "1px solid var(--grey80)",
            },
            "& > svg": {
                fontSize: 24,
                width: 24,
            },
            "&:hover": {
                backgroundColor: "var(--grey97)",
            },
            ...(extraCss as Record<string, unknown>),
        }}
    >
        {icon ?? <svg />}
        <div>{children}</div>
    </li>
);
