import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faInfoCircle, faCog, faMoon } from "@fortawesome/free-solid-svg-icons";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageIcon from "ionicons/dist/svg/language.svg";
import MenuIcon from "ionicons/dist/svg/ellipsis-vertical.svg";

import { languages } from "../i18n";
import { match } from "../util";


const HEIGHT = 60;

export const Header: React.FC = () => (
    <div css={{
        height: HEIGHT,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "white",
        borderBottom: "1px solid #bbb",
    }}>
        <Logo />
        <Search />
        <ActionIcons />
    </div>
);

const Logo: React.FC = () => (
    <Link to="/" css={{ height: "100%", flex: "0 0 auto" }}>
        <picture css={{ height: "100%" }}>
            <source media="(min-width: 450px)" srcSet="/assets/static/logo-large.svg" />
            <img
                css={{ height: "100%", padding: "4px 8px" }}
                src="/assets/static/logo-small.svg"
            />
        </picture>
    </Link>
);


const SEARCH_HEIGHT = 35;

const Search: React.FC = () => {
    const { t } = useTranslation();

    return (
        <input
            type="text"
            placeholder={t("search")}
            css={{
                flex: "1 1 0px",
                margin: "0 8px",
                minWidth: 50,
                maxWidth: 280,
                height: SEARCH_HEIGHT,
                borderRadius: SEARCH_HEIGHT / 2,
                border: "1.5px solid #ccc",
                padding: `0 ${SEARCH_HEIGHT / 2}px`,
            }}
        />
    );
};

// The icons on the right side of the header: changing language and main menu.
const ActionIcons: React.FC = () => {
    const { t } = useTranslation();

    type MenuState = "closed" | "language" | "menu";
    const [menuState, setMenuState] = useState<MenuState>("closed");
    const toggleMenu = (state: MenuState) => {
        setMenuState(menuState === state ? "closed" : state);
    };

    const iconSize = 30;
    const iconDivStyle = {
        padding: 6,
        margin: "0 4px",
        borderRadius: 4,
        lineHeight: 0,
        cursor: "pointer",
        fontSize: iconSize,
        "&:hover": {
            backgroundColor: "#ddd",
        },
    };

    return (
        <div css={{ display: "flex", height: "100%", alignItems: "center", position: "relative" }}>
            <div
                title={`${t("language")}: ${t("language-name")}`}
                onClick={() => toggleMenu("language")}
                css={iconDivStyle}
            >
                <LanguageIcon />
            </div>
            <div
                title={t("main-menu.label")}
                onClick={() => toggleMenu("menu")}
                css={iconDivStyle}
            >
                <MenuIcon />
            </div>
            <div css={{
                position: "absolute",
                ...menuState === "closed" && { display: "none" },
                top: "100%",
                right: 0,
                minWidth: 180,
                border: "1px solid #bbb",
                borderTop: "1px dashed #bbb",
                borderRight: "none",
                maxWidth: "100vw",
                backgroundColor: "white",
            }}>
                {match(menuState, {
                    "closed": () => null,
                    "language": () => <LanguageList />,
                    "menu": () => <MainMenu closeMenu={() => setMenuState("closed")} />,
                })}
            </div>
        </div>
    );
};

// The main menu with several links and functions.
const MainMenu: React.FC<{ closeMenu: () => void }> = ({ closeMenu }) => {
    const { t } = useTranslation();
    const iconStyle = {
        display: "inline-block",
        marginRight: 16,
        color: "#666",
    };

    const itemStyle = {
        display: "block",
        whiteSpace: "nowrap" as const,
        padding: "6px 8px 6px 12px",
        textDecoration: "none",
        "&:hover": {
            backgroundColor: "#ddd",
        },
    };

    return <>
        <div css={{
            borderBottom: "1px solid #bbb",
            textAlign: "center",
            minWidth: 220,
            padding: 8,
        }}>
            {t("login.not-logged-in")}
            <LoginButton closeMenu={closeMenu}/>
        </div>
        <ul css={{
            width: "100%",
            listStyle: "none",
            margin: 0,
            padding: 0,
            fontSize: 18,
        }}>
            <li css={itemStyle}>
                <FontAwesomeIcon icon={faMoon} fixedWidth css={iconStyle} />
                {t("main-menu.theme")}
            </li>
            <li>
                <Link to="/settings" css={itemStyle} onClick={closeMenu}>
                    <FontAwesomeIcon icon={faCog} fixedWidth css={iconStyle} />
                    {t("main-menu.settings")}
                </Link>
            </li>
            <li>
                <Link to="/about" css={itemStyle} onClick={closeMenu}>
                    <FontAwesomeIcon icon={faInfoCircle} fixedWidth css={iconStyle} />
                    {t("main-menu.about")}
                </Link>
            </li>
        </ul>
    </>;
};

const LoginButton: React.FC<{ closeMenu: () => void }> = ({ closeMenu }) => {
    const { t } = useTranslation();

    return (
        <Link
            to="/login"
            onClick={closeMenu}
            css={{
                display: "inline-block",
                marginTop: 8,
                padding: "4px 8px",
                fontSize: 18,
                textDecoration: "none",
                whiteSpace: "nowrap",
                border: "2px solid #495dce",
                borderRadius: 3,
                "&:hover": {
                    boxShadow: "0 0 5px #0000004d",
                },
            }}
        >
            {t("login.button-label")}
        </Link>
    );
};

const LanguageList = () => {
    const { t, i18n } = useTranslation();

    return (
        <ul css={{
            width: "100%",
            listStyle: "none",
            fontSize: 18,
            margin: 0,
            padding: 0,
        }}>
            {Object.keys(languages).map(lng => {
                // We check whether a language is active by simply translating
                // with the automatically determined language and with the
                // specific one. If the result is the same, that's the current
                // language.
                //
                // I do realize that it could be that one language "foo" has
                // only the string "language-name" translated and thus, the
                // whole page would be shown with the fallback language (en),
                // but the language menu would still show "foo" as active
                // language. Or imagine the other way around: everything except
                // "language-name" is translated. But both of these cases should
                // be avoided anyway when creating a translation.
                const isActive = t("language-name", { lng }) === t("language-name");

                return (
                    <li
                        onClick={() => i18n.changeLanguage(lng)}
                        key={lng}
                        css={{
                            padding: "6px 8px 6px 12px",
                            cursor: "pointer",
                            "&:hover": {
                                backgroundColor: "#ddd",
                            },
                        }}
                    >
                        <div className="fa-fw" css={{ display: "inline-block", marginRight: 16 }}>
                            {isActive && <FontAwesomeIcon icon={faCheck} fixedWidth />}
                        </div>
                        {t("language-name", { lng })}
                    </li>
                );
            })}
        </ul>
    );
};
