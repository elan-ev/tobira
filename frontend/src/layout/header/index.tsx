import React from "react";
import { FiArrowLeft, FiMenu, FiX } from "react-icons/fi";
import { HiOutlineSearch } from "react-icons/hi";
import { useTranslation } from "react-i18next";

import { useMenu } from "../MenuState";
import { BREAKPOINT as NAV_BREAKPOINT } from "../Navigation";
import { match } from "../../util";
import { OUTER_CONTAINER_MARGIN } from "..";
import { ActionIcon, ButtonContainer, HEADER_BASE_PADDING } from "./ui";
import { SearchField } from "./Search";
import { Logo } from "./Logo";
import { LanguageSettings, UserBox } from "./UserBox";
import { COLORS } from "../../color";


type Props = {
    hideNavIcon?: boolean;
    loginMode?: boolean;
};

export const Header: React.FC<Props> = ({ hideNavIcon = false, loginMode = false }) => {
    const menu = useMenu();

    const content = match(menu.state, {
        "closed": () => <DefaultMode hideNavIcon={hideNavIcon} />,
        "search": () => <SearchMode />,
        "burger": () => <OpenMenuMode />,
    });

    return <>
        <header css={{
            margin: OUTER_CONTAINER_MARGIN,
            height: "var(--header-height)",
            display: "flex",
            padding: `${HEADER_BASE_PADDING}px 16px`,
            paddingLeft: 0,
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: COLORS.background,
        }}>
            {loginMode ? <LoginMode /> : content}
        </header>
        <div css={{ margin: "0 0 16px 0 ", height: 2, backgroundColor: COLORS.grey2 }} />
    </>;
};

const LoginMode: React.FC = () => <>
    <Logo />
    <ButtonContainer>
        <LanguageSettings />
    </ButtonContainer>
</>;

const SearchMode: React.FC = () => {
    const { t } = useTranslation();
    const menu = useMenu();

    return <>
        <ActionIcon title={t("back")} onClick={() => menu.close()} css={{ marginLeft: 8 }}>
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
            <ActionIcon
                title={t("close")}
                onClick={() => menu.close()}
                css={buttonOutline}
            >
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
            <UserBox />
            {!hideNavIcon && (
                <ActionIcon
                    title={t("main-menu.label")}
                    onClick={() => menu.toggleMenu("burger")}
                    css={{
                        ...buttonOutline,
                        // More margin because of the outline
                        marginLeft: 4,
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

const buttonOutline = {
    button: {
        padding: 5,
        outline: `1.5px solid ${COLORS.grey4}`,
    },
};
