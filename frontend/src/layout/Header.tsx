import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCaretDown } from "@fortawesome/free-solid-svg-icons";
import { Link } from "react-router-dom";


const HEIGHT = 60;

export const Header: React.FC = () => (
    <div css={{
        height: HEIGHT,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "white",
        borderBottom: "1px solid #bbb",
        padding: "0 8px",
    }}>
        <Logo />
        <Search />
        <Menu />
    </div>
);

const Logo: React.FC = () => (
    <Link to="/" css={{ height: "100%", flex: "0 0 auto" }}>
        <picture css={{
            height: "100%",
            "& > *": { height: "100%", padding: "4px 0" },
        }}>
            <source media="(min-width: 450px)" srcSet="/assets/static/logo-large.svg" />
            <img src="/assets/static/logo-small.svg" />
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

const Menu: React.FC = () => (
    <div>
        Not logged in
        <FontAwesomeIcon css={{ marginLeft: 4 }} icon={faCaretDown} />
    </div>
);
