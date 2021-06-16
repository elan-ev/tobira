import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faBars, faSearch, faTimes } from "@fortawesome/free-solid-svg-icons";
import { useTranslation } from "react-i18next";

import CONFIG from "../config";
import { Link } from "../router";


export const HEIGHT = 60;


type Props = {
    burgerVisible: boolean;
    setBurgerVisible: (visible: boolean) => void;
};

export const Header: React.FC<Props> = ({ burgerVisible, setBurgerVisible }) => {
    const { t } = useTranslation();
    const [searchActive, setSearchActive] = useState(false);

    if (searchActive && burgerVisible) {
        console.log("unexpected state: search active and burger visible");
    }

    const content = (() => {
        if (searchActive) {
            return <>
                <ActionIcon title={t("back")} onClick={() => setSearchActive(false)} >
                    <FontAwesomeIcon icon={faArrowLeft} />
                </ActionIcon>
                <SearchField variant="mobile" />
            </>;
        } else {
            return <>
                <Logo />
                {!burgerVisible && <SearchField variant="desktop" />}
                <div css={{ display: "flex", height: "100%", position: "relative" }}>
                    {!burgerVisible && <ActionIcon
                        title={t("search")}
                        onClick={() => setSearchActive(true)}
                        smallScreensOnly={true}
                    >
                        <FontAwesomeIcon icon={faSearch} fixedWidth />
                    </ActionIcon>}

                    <ActionIcon
                        title={t("main-menu.label")}
                        onClick={() => setBurgerVisible(!burgerVisible)}
                    >
                        {burgerVisible
                            ? <FontAwesomeIcon icon={faTimes} fixedWidth />
                            : <FontAwesomeIcon icon={faBars} fixedWidth />}
                    </ActionIcon>
                </div>
            </>;
        }
    })();

    return (
        <header css={{
            height: "var(--header-height)",
            display: "flex",
            padding: "var(--header-padding) min(5vw, var(--header-padding))",
            marginBottom: "16px",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "white",
        }}>
            {content}
        </header>
    );
};

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
const SEARCH_BREAKPOINT = 600;

type SearchFieldProps = {
    variant: "desktop" | "mobile";
};

const SearchField: React.FC<SearchFieldProps> = ({ variant }) => {
    const { t } = useTranslation();

    const extraCss = variant === "desktop"
        ? {
            maxWidth: 280,
            [`@media (max-width: ${SEARCH_BREAKPOINT}px)`]: {
                display: "none",
            }
        }
        : {
            width: "100%",
        };

    return (
        <input
            type="text"
            placeholder={t("search")}
            css={{
                flex: "1 1 0px",
                margin: "0 8px",
                minWidth: 50,
                height: SEARCH_HEIGHT,
                borderRadius: SEARCH_HEIGHT / 2,
                border: "1.5px solid #ccc",
                padding: `0 ${SEARCH_HEIGHT / 2}px`,
                ...extraCss
            }}
        />
    );
};


type ActionIconProps = {
    onClick: () => void;
    title: string;
    smallScreensOnly?: boolean;
};

/** A single button with icon in the header. */
const ActionIcon: React.FC<ActionIconProps> = ({
    title,
    onClick,
    smallScreensOnly = false,
    children,
}) => {
    const iconSize = 28;

    return (
        <div css={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            ...smallScreensOnly && {
                display: "none",
                [`@media (max-width: ${SEARCH_BREAKPOINT}px)`]: {
                    display: "flex",
                },
            }
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
