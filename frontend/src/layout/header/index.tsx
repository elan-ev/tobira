import React, { useEffect, useState } from "react";
import { LuArrowLeft, LuMenu, LuX } from "react-icons/lu";
import { HiOutlineSearch } from "react-icons/hi";
import { useTranslation } from "react-i18next";
import { match, screenWidthAbove } from "@opencast/appkit";

import { useMenu } from "../MenuState";
import { BREAKPOINT as NAV_BREAKPOINT } from "../Navigation";
import { OUTER_CONTAINER_MARGIN } from "..";
import { ActionIcon, ButtonContainer, HEADER_BASE_PADDING } from "./ui";
import { SearchField } from "./Search";
import { Logo } from "./Logo";
import { ColorSchemeSettings, LanguageSettings, UserBox } from "./UserBox";
import { COLORS } from "../../color";


type Props = {
    hideNavIcon?: boolean;
    loginMode?: boolean;
};

export const HEADER_THIN_HEIGHT = 64;

export const Header: React.FC<Props> = ({ hideNavIcon = false, loginMode = false }) => {
    const menu = useMenu();
    const content = match(menu.state, {
        "closed": () => <DefaultMode hideNavIcon={hideNavIcon} />,
        "search": () => <SearchMode />,
        "burger": () => <OpenMenuMode />,
    });

    const thinRatioOf = (scrollY: number) => Math.min(1, scrollY / HEADER_THIN_HEIGHT);
    const [thinRatio, setThinRatio] = useState(thinRatioOf(window.scrollY));
    useEffect(() => {
        const callback = () => setThinRatio(thinRatioOf(window.scrollY));
        window.addEventListener("scroll", callback);
        return () => window.removeEventListener("scroll", callback);
    }, []);

    return <>
        <div css={{
            height: "var(--header-height)",
            marginBottom: 16,
            zIndex: 1500,
        }}>
            <div css={{
                position: "fixed",
                width: "100%",
                backgroundColor: `rgb(from ${COLORS.neutral15} r g b / 60%)`,
                backdropFilter: "blur(16px)",
            }}>
                <header css={{
                    margin: OUTER_CONTAINER_MARGIN,
                    height: `calc(${thinRatio} * ${HEADER_THIN_HEIGHT}px `
                        + `+ ${1 - thinRatio} * var(--header-height))`,
                    display: "flex",
                    padding: `${HEADER_BASE_PADDING}px 16px`,
                    paddingLeft: 0,
                    alignItems: "center",
                    justifyContent: "space-between",
                }}>
                    {loginMode ? <LoginMode /> : content}
                </header>
            </div>
        </div>
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

    return <>
        <ActionIcon
            title={t("general.action.back")}
            onClick={() => menu.close()}
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
