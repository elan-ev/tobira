import React from "react";
import { HiOutlineSearch } from "react-icons/hi";
import { FiArrowLeft, FiMenu, FiX } from "react-icons/fi";
import { useTranslation } from "react-i18next";

import { useMenu } from "../MenuState";
import { BREAKPOINT as NAV_BREAKPOINT } from "../Navigation";
import { match } from "../../util";
import { OUTER_CONTAINER_MARGIN } from "..";
import { ActionIcon, ButtonContainer, HEADER_BASE_PADDING } from "./ui";
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
            height: "var(--header-height)",
            display: "flex",
            padding: `${HEADER_BASE_PADDING}px 8px`,
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
            {/* TODO: Adjust color. */}
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
            <UserBox />

            <ActionIcon
                title={t("search.input-label")}
                onClick={() => menu.toggleMenu("search")}
                css={{
                    [`@media not all and (max-width: ${NAV_BREAKPOINT}px)`]: {
                        display: "none",
                    },
                }}
            >
                <HiOutlineSearch />
            </ActionIcon>

            {!hideNavIcon && (
                <ActionIcon
                    title={t("main-menu.label")}
                    onClick={() => menu.toggleMenu("burger")}
                    css={{
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
