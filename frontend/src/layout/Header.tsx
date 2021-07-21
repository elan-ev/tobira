import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faBars, faSearch, faTimes, faUser } from "@fortawesome/free-solid-svg-icons";
import { useTranslation } from "react-i18next";
import type { Interpolation, Theme } from "@emotion/react";

import CONFIG from "../config";
import { Link } from "../router";
import { useMenu } from "./MenuState";
import { BREAKPOINT as NAV_BREAKPOINT } from "./Navigation";
import { match } from "../util";


export const HEIGHT = 60;


type Props = {
    hideNavIcon?: boolean;
};

export const Header: React.FC<Props> = ({ hideNavIcon = false }) => {
    const menu = useMenu();

    const content = match(menu.state, {
        "closed": () => <DefaultMode hideNavIcon={hideNavIcon} />,
        "search": () => <SearchMode />,
        "burger": () => <OpenMenuMode />,
    });

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

const SearchMode: React.FC = () => {
    const { t } = useTranslation();
    const menu = useMenu();

    return <>
        <ActionIcon title={t("back")} onClick={() => menu.close()} >
            <FontAwesomeIcon icon={faArrowLeft} />
        </ActionIcon>
        <SearchField variant="mobile" />
    </>;
};

const OpenMenuMode: React.FC = () => {
    const { t } = useTranslation();
    const menu = useMenu();

    return <>
        <Logo />
        <ButtonContainer>
            <ActionIcon title={t("close")} onClick={() => menu.close()}>
                <FontAwesomeIcon icon={faTimes} fixedWidth />
            </ActionIcon>
        </ButtonContainer>
    </>;
};

const DefaultMode: React.FC<{ hideNavIcon: boolean }> = ({ hideNavIcon }) => {
    const { t } = useTranslation();
    const menu = useMenu();

    return <>
        <Logo />
        <SearchField variant="desktop" />
        <ButtonContainer>
            <ActionIcon
                title={t("search")}
                onClick={() => menu.toggleMenu("search")}
                extraCss={{
                    display: "none",
                    [`@media (max-width: ${NAV_BREAKPOINT}px)`]: {
                        display: "flex",
                    },
                }}
            >
                <FontAwesomeIcon icon={faSearch} fixedWidth />
            </ActionIcon>

            <ActionIcon title={t("user.settings")} onClick={() => {}}>
                <FontAwesomeIcon icon={faUser} fixedWidth />
            </ActionIcon>

            {!hideNavIcon && (
                <ActionIcon
                    title={t("main-menu.label")}
                    onClick={() => menu.toggleMenu("burger")}
                    extraCss={{
                        [`@media not all and (max-width: ${NAV_BREAKPOINT}px)`]: {
                            display: "none",
                        },
                    }}
                >
                    <FontAwesomeIcon icon={faBars} fixedWidth />
                </ActionIcon>
            )}
        </ButtonContainer>
    </>;
};

const ButtonContainer: React.FC = ({ children }) => (
    <div css={{ display: "flex", height: "100%", position: "relative" }}>
        {children}
    </div>
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


type SearchFieldProps = {
    variant: "desktop" | "mobile";
};

const SearchField: React.FC<SearchFieldProps> = ({ variant }) => {
    const { t } = useTranslation();

    const extraCss = variant === "desktop"
        ? {
            maxWidth: 280,
            [`@media (max-width: ${NAV_BREAKPOINT}px)`]: {
                display: "none",
            },
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
                height: 35,
                borderRadius: 4,
                border: "1.5px solid #ccc",
                padding: "0 12px",
                "&:focus": {
                    outline: "none",
                    // TODO: make color configurable
                    boxShadow: "0 0 0 1px #007A96",
                    borderColor: "#007A96",
                },
                ...extraCss,
            }}
        />
    );
};


type ActionIconProps = {
    onClick: () => void;
    title: string;
    extraCss?: Interpolation<Theme>;
};

/** A single button with icon in the header. */
const ActionIcon: React.FC<ActionIconProps> = ({
    title,
    onClick,
    extraCss = {},
    children,
}) => (
    <div css={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        ...(extraCss as Record<string, unknown>),
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
                fontSize: 28,
                "&:hover": {
                    backgroundColor: "#ddd",
                },
                "@media (max-width: 450px)": {
                    fontSize: 24,
                },
            }}
        >{children}</div>
    </div>
);
