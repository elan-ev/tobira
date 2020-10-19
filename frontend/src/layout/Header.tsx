import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCaretDown } from "@fortawesome/free-solid-svg-icons";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { languages } from "../i18n";
import LanguageIcon from "ionicons/dist/svg/language.svg";


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
        <Menu />
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

const Menu: React.FC = () => {
    const { t, i18n } = useTranslation();

    type MenuState = "closed" | "language";
    const [menuState, setMenuState] = useState<MenuState>("closed");
    const toggleMenu = (state: MenuState) => {
        setMenuState(menuState === state ? "closed" : state);
    };

    const menuContent = (() => {
        switch (menuState) {
            case "closed": return null;
            case "language": return (
                <ul css={{
                    width: "100%",
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                }}>
                    {Object.keys(languages).map(lng => (
                        <li
                            onClick={() => i18n.changeLanguage(lng)}
                            key={lng}
                            css={{
                                padding: "4px 8px 4px 16px",
                                cursor: "pointer",
                                "&:hover": {
                                    backgroundColor: "#ddd",
                                },
                            }}
                        >{t("language-name", { lng })}</li>
                    ))}
                </ul>
            );
            // TODO: extract this helper function and give it a good name.
            default: return ((x: never) => x)(menuState);
        }
    })();

    return (
        <div css={{ display: "flex", height: "100%", alignItems: "center", position: "relative" }}>
            <div title={`${t("language")}: ${t("language-name")}`}>
                <LanguageIcon
                    onClick={() => toggleMenu("language")}
                    css={{
                        fontSize: 38,
                        margin: "0 8px",
                        padding: 6,
                        borderRadius: 4,
                        cursor: "pointer",
                        "&:hover": {
                            backgroundColor: "#ddd",
                        },
                    }}
                />
            </div>
            <div>
                Menu
                <FontAwesomeIcon css={{ marginLeft: 4 }} icon={faCaretDown} size="lg" />
            </div>
            <div css={{
                position: "absolute",
                ...menuState === "closed" && { display: "none" },
                top: "100%",
                right: 0,
                width: 180,
                border: "1px solid #bbb",
                borderTop: "1px dashed #bbb",
                borderRight: "none",
                maxWidth: "100vw",
                backgroundColor: "white",
            }}>{menuContent}</div>
        </div>
    );
};
