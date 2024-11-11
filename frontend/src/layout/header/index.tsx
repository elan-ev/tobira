import React, { useEffect } from "react";
import { LuArrowLeft, LuMenu, LuX } from "react-icons/lu";
import { HiOutlineSearch } from "react-icons/hi";
import { useTranslation } from "react-i18next";
import { match, screenWidthAbove, screenWidthAtMost } from "@opencast/appkit";

import { useMenu } from "../MenuState";
import { BREAKPOINT as NAV_BREAKPOINT } from "../Navigation";
import { OUTER_CONTAINER_MARGIN } from "..";
import { ActionIcon, ButtonContainer, HEADER_BASE_PADDING } from "./ui";
import { SearchField } from "./Search";
import { Logo } from "./Logo";
import { ColorSchemeSettings, LanguageSettings, UserBox } from "./UserBox";
import { COLORS } from "../../color";
import { useRouter } from "../../router";
import { handleCancelSearch, isSearchActive, SearchRoute } from "../../routes/Search";


type Props = {
    hideNavIcon?: boolean;
    loginMode?: boolean;
};

export const Header: React.FC<Props> = ({ hideNavIcon = false, loginMode = false }) => {
    const menu = useMenu();
    const router = useRouter();
    const q = screenWidthAtMost(NAV_BREAKPOINT).replace(/^@media /, "");
    const onNarrowScreen = window.matchMedia(q).matches;
    useEffect(() => (
        router.listenAtNav(({ newRoute }) => {
            if (onNarrowScreen && (menu.state === "search") !== (newRoute === SearchRoute)) {
                menu.toggleMenu("search");
            }
        })
    ));

    const onSearchRoute = isSearchActive();
    const content = match((onSearchRoute && onNarrowScreen) ? "search" : menu.state, {
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
            backgroundColor: COLORS.neutral05,
        }}>
            {loginMode ? <LoginMode /> : content}
        </header>
        <div css={{ margin: "0 0 16px 0 ", height: 2, backgroundColor: COLORS.neutral15 }} />
    </>;
};

const LoginMode: React.FC = () => <>
    <Logo />
    <ButtonContainer>
        <LanguageSettings />
        <ColorSchemeSettings />
    </ButtonContainer>
</>;

const SearchMode: React.FC = () => {
    const { t } = useTranslation();
    const menu = useMenu();
    const onSearchRoute = isSearchActive();
    const router = useRouter();

    return <>
        <ActionIcon
            title={t("general.action.back")}
            onClick={() => onSearchRoute ? handleCancelSearch(router) : menu.close()}
            css={{ marginLeft: 8 }}
        >
            <LuArrowLeft />
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
                title={t("general.action.close")}
                onClick={() => menu.close()}
                css={buttonOutline}
            >
                <LuX />
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
                    [screenWidthAbove(NAV_BREAKPOINT)]: {
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
                        [screenWidthAbove(NAV_BREAKPOINT)]: {
                            display: "none",
                        },
                    }}
                >
                    <LuMenu />
                </ActionIcon>
            )}
        </ButtonContainer>
    </>;
};

const buttonOutline = {
    button: {
        padding: 5,
        outline: `1.5px solid ${COLORS.neutral25}`,
    },
};
