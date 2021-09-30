import React from "react";
import { HiOutlineSearch } from "react-icons/hi";
import { FiArrowLeft, FiMenu, FiX } from "react-icons/fi";
import { useTranslation } from "react-i18next";

import { useMenu } from "../MenuState";
import { BREAKPOINT as NAV_BREAKPOINT } from "../Navigation";
import { match } from "../../util";
import { OUTER_CONTAINER_MARGIN } from "..";
import { ActionIcon, BASE_LOGO_MARGIN, ButtonContainer } from "./ui";
import { SearchField } from "./Search";
import { Logo } from "./Logo";
import { UserBox } from "./UserBox";


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
            margin: OUTER_CONTAINER_MARGIN,
            marginBottom: "16px",
            height: "var(--outer-header-height)",
            display: "flex",
            paddingTop: BASE_LOGO_MARGIN,
            paddingBottom: BASE_LOGO_MARGIN,
            paddingRight: 8,
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
            <FiArrowLeft />
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
                <FiX />
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
                <HiOutlineSearch />
            </ActionIcon>

            <UserBox />

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
                    <FiMenu />
                </ActionIcon>
            )}
        </ButtonContainer>
    </>;
};
