import { jsx } from "@emotion/core";
import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCaretDown } from "@fortawesome/free-solid-svg-icons";
import { Link } from "react-router-dom";


const HEIGHT = 60;

export const Header: React.FC = () => {
    return (
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
};

const Logo: React.FC = () => (
    <Link to="/" css={{ height: "100%" }}>
        <img
            src="/assets/static/logo-large.svg"
            css={{ height: "100%", padding: "4px 0" }}
        />
    </Link>
);

const Search: React.FC = () => (
    <input type="text" placeholder="Search" />
);

const Menu: React.FC = () => (
    <div>
        Not logged in
        <FontAwesomeIcon css={{ marginLeft: 4 }} icon={faCaretDown} />
    </div>
);
