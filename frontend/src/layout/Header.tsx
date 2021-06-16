import React from "react";
import { useTranslation } from "react-i18next";
import MenuIcon from "ionicons/dist/svg/menu.svg";
import MenuCloseIcon from "ionicons/dist/svg/close.svg";

import CONFIG from "../config";
import { Link } from "../router";


export const HEIGHT = 60;


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

    return (
        <div css={{ display: "flex", height: "100%", position: "relative" }}>
            <ActionIcon
                title={t("main-menu.label")}
                onClick={() => setBurgerVisible(!burgerVisible)}
            >
                {burgerVisible ? <MenuCloseIcon /> : <MenuIcon />}
            </ActionIcon>
        </div>
    );
};

type ActionIconProps = {
    onClick: () => void;
    title: string;
};

/** A single button with icon in the header. */
const ActionIcon: React.FC<ActionIconProps> = ({ title, onClick, children }) => {
    const iconSize = 28;

    return (
        <div css={{
            height: "100%",
            display: "flex",
            alignItems: "center",
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
