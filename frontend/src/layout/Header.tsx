import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faInfoCircle, faCog, faMoon } from "@fortawesome/free-solid-svg-icons";
import { useTranslation } from "react-i18next";
import LanguageIcon from "ionicons/dist/svg/language.svg";
import MenuIcon from "ionicons/dist/svg/menu.svg";
import MenuCloseIcon from "ionicons/dist/svg/close.svg";

import { languages } from "../i18n";
import { match } from "../util";
import CONFIG from "../config";
import { Link } from "../router";


export const HEIGHT = 60;
const HEADER_BORDER_WIDTH = 1;


type Props = {
    burgerVisible: boolean;
    setBurgerVisible: (visible: boolean) => void;
};

export const Header: React.FC<Props> = ({ burgerVisible, setBurgerVisible }) => (
    <header css={{
        height: "var(--header-height)",
        display: "flex",
        padding: "var(--header-padding) min(5vw, var(--header-padding))",
        marginBottom: "16px",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "white",
    }}>
        <Logo />
        {!burgerVisible && <Search />}
        <ActionIcons setBurgerVisible={setBurgerVisible} burgerVisible={burgerVisible} />
    </header>
);

const Logo: React.FC = () => (
    <Link to="/" css={{ height: "100%", flex: "0 1 auto" }}>
        <picture css={{ height: "100%" }}>
            <source media="(min-width: 450px)" srcSet={CONFIG.logo.large} />
            <img
                css={{ height: "100%", maxWidth: "100%" }}
                src={CONFIG.logo.small}
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


type ActionButtonProps = {
    burgerVisible: boolean;
    setBurgerVisible: (visible: boolean) => void;
};

/** The icons on the right side of the header: changing language and main menu. */
const ActionIcons: React.FC<ActionButtonProps> = ({ setBurgerVisible, burgerVisible }) => {
    const { t } = useTranslation();

    type MenuState = "closed" | "language" | "menu";
    const [menuState, setMenuState] = useState<MenuState>("closed");
    const toggleMenu = (state: MenuState) => {
        setMenuState(menuState === state ? "closed" : state);
    };

    return (
        <div css={{ display: "flex", height: "100%", position: "relative" }}>
            {!burgerVisible && <ActionIcon
                title={`${t("language")}: ${t("language-name")}`}
                onClick={() => toggleMenu("language")}
                isActive={menuState === "language"}
            >
                <LanguageIcon />
            </ActionIcon>}

            <ActionIcon
                title={t("main-menu.label")}
                onClick={() => setBurgerVisible(!burgerVisible)}
                isActive={menuState === "menu"}
            >
                {burgerVisible ? <MenuCloseIcon /> : <MenuIcon />}
            </ActionIcon>

            <div css={{
                position: "absolute",
                ...menuState === "closed" && { display: "none" },
                top: `calc(100% + ${HEADER_BORDER_WIDTH}px)`,
                right: 0,
                zIndex: 20,
                minWidth: 180,
                border: "1px solid #bbb",
                borderTop: "none",
                borderRight: "none",
                maxWidth: "100vw",
                "&::after": {
                    content: "''",
                    position: "absolute",
                    top: 10,
                    bottom: -2,
                    left: 0,
                    right: 0,
                    zIndex: -1,
                    backgroundColor: "#0000001a",
                    boxShadow: "0 0 7px 3px #0000001a",
                },
            }}>
                <div css={{ backgroundColor: "white" }}>
                    {match(menuState, {
                        "closed": () => null,
                        "language": () => <LanguageList />,
                        "menu": () => <MainMenu closeMenu={() => setMenuState("closed")} />,
                    })}
                </div>
            </div>
        </div>
    );
};

type ActionIconProps = {
    onClick: () => void;
    title: string;
    isActive: boolean;
};

/**
 * A single icon/button on the right of the header. There is some trickery
 * involved to make this arrow/triangle indicator when a specific icon is
 * active.
 */
const ActionIcon: React.FC<ActionIconProps> = ({ title, onClick, isActive, children }) => {
    const iconSize = 28;
    const arrowSize = 14;

    return (
        <div css={{
            height: "100%",
            position: "relative",
            display: "flex",
            alignItems: "center",
            ...isActive && {
                "&::after": {
                    content: "''",
                    display: "block" as const,
                    position: "absolute" as const,
                    bottom: -arrowSize / 2,
                    backgroundColor: "white",
                    zIndex: 10,
                    width: arrowSize,
                    height: arrowSize,
                    borderTop: "1px solid #bbb",
                    borderLeft: "1px solid #bbb",
                    transform: "rotate(45deg)",

                    // Horizontally center
                    left: 0,
                    right: 0,
                    margin: "auto",
                },
            },
        }}>
            <div
                title={title}
                onClick={onClick}
                css={{
                    padding: 5,
                    margin: "0 4px",
                    borderRadius: 4,
                    lineHeight: 0,
                    cursor: "pointer",
                    fontSize: iconSize,
                    "&:hover": {
                        backgroundColor: "#ddd",
                    },
                }}
            >{children}</div>
        </div>
    );
};

/** The main menu with several links and functions. */
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
            <LoginButton onClick={closeMenu}/>
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

const LoginButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
    const { t } = useTranslation();

    return (
        <Link
            to="/login"
            onClick={onClick}
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
    const currentLng = i18n.languages.find(lng => Object.keys(languages).includes(lng));

    return (
        <ul css={{
            width: "100%",
            listStyle: "none",
            fontSize: 18,
            margin: 0,
            padding: 0,
        }}>
            {Object.keys(languages).map(lng => (
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
                        {currentLng === lng && <FontAwesomeIcon icon={faCheck} fixedWidth />}
                    </div>
                    {t("language-name", { lng })}
                </li>
            ))}
        </ul>
    );
};
