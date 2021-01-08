import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCaretDown, faCheck } from "@fortawesome/free-solid-svg-icons";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageIcon from "ionicons/dist/svg/language.svg";

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
    const { t } = useTranslation();

    type MenuState = "closed" | "language";
    const [menuState, setMenuState] = useState<MenuState>("closed");
    const toggleMenu = (state: MenuState) => {
        setMenuState(menuState === state ? "closed" : state);
    };

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
            }}>
                {match(menuState, {
                    "closed": () => null,
                    "language": () => <LanguageList />,
                })}
            </div>
        </div>
    );
};

const LanguageList = () => {
    const { t, i18n } = useTranslation();

    return (
        <ul css={{
            width: "100%",
            listStyle: "none",
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
