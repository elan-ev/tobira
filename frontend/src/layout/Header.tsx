import React from "react";
import { HiOutlineSearch } from "react-icons/hi";
import { FiArrowLeft, FiMenu, FiX, FiUser } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import type { Interpolation, Theme } from "@emotion/react";

import CONFIG from "../config";
import { Link } from "../router";
import { useMenu } from "./MenuState";
import { BREAKPOINT as NAV_BREAKPOINT } from "./Navigation";
import { match } from "../util";
import { OUTER_CONTAINER_MARGIN } from "./Root";
import { SMALLER_FONT_BREAKPOINT } from "../GlobalStyle";


const BUTTONS_WIDTH = 138;
const BASE_LOGO_MARGIN = "calc(var(--logo-margin) * var(--inner-header-height))";


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

            <ActionIcon title={t("user.settings")} onClick={() => {}}>
                <FiUser />
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
                    <FiMenu />
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

const Logo: React.FC = () => {
    // This is a bit tricky: we want to specify the `width` and `height`
    // attributes on the `img` elements in order to avoid layout shift. That
    // already rules out the `<picture>` element since that assumes all sources
    // have the same aspect ratio.
    //
    // The resolutions of the logos is specified in the config. However, to
    // faithfully represent the aspect ratio of the images with an integer
    // resolution, large numbers might be required. But setting the `width` to
    // a large number means the `<img>` will take that space in pixels. But
    // that's often too large. Easy fix: `width: auto` since we already have
    // `height: 100%`. However, we also need `max-width: 100%` so that the logo
    // shrinks on very small screens. But using that makes the logo not take up
    // the correct width when still being loaded: the parent `<a>` shrinks as
    // much as possible, making the `max-width: 100%` also shrink the image.
    //
    // The solution is to calculate the correct `flex-basis` for the `<a>`
    // element manually.

    const small = CONFIG.logo.small;
    const large = CONFIG.logo.large;
    const smallAr = small.resolution[0] / small.resolution[1];
    const largeAr = large.resolution[0] / large.resolution[1];

    // The margin calculation is a bit involved, unfortunately. Many CIs will
    // define margins around a logo that have to stay blank. Doing that would
    // be easy, but it quickly becomes suboptimal on small screens. There, at
    // least for wide logos, the logo has to shrink in order for the full
    // header to still fit on the screen. But applying margin the naive way
    // (which would be just `BASE_LOGO_MARGIN`) will result in way too much
    // margin in those situations as the margin assumes the full size of the
    // logo, not the shrunk size.
    //
    // So we manually do the size calculation and shrink the margin if it's
    // lower than `BASE_LOGO_MARGIN`:
    //
    // - `max(100vw, var(--min-page-width))`: this is the full header width. The
    //   header might have margin on large screens, but this issue is only
    //   about small screens.
    // - `- ${BUTTONS_WIDTH}px`: we subtract the fixed width of the
    //   buttons/icons to get the remaining available width.
    // - `(2 + ${ar})`: we share the remaining width between 2 times margins
    //   (left & right) and the logo itself. This is in units of logo height.
    const actualMargin = (ar: number) => `min(
        ${BASE_LOGO_MARGIN},
        calc((max(100vw, var(--min-page-width)) - ${BUTTONS_WIDTH}px) / (2 + ${ar}))
    )`;

    return (
        <Link
            to="/"
            css={{
                height: "100%",
                flex: `0 1 calc(var(--inner-header-height) * ${largeAr})`,
                margin: `0 ${actualMargin(largeAr)}`,
                [`@media (max-width: ${SMALLER_FONT_BREAKPOINT}px)`]: {
                    flex: `0 1 calc(var(--inner-header-height) * ${smallAr})`,
                    margin: `0 ${actualMargin(smallAr)}`,
                },
                "& > img": {
                    height: "100%",
                    width: "auto",
                    maxWidth: "100%",
                },
            }}
        >
            <img
                width={large.resolution[0]}
                height={large.resolution[1]}
                src={large.path}
                css={{
                    [`@media (max-width: ${SMALLER_FONT_BREAKPOINT}px)`]: {
                        display: "none",
                    },
                }}
            />
            <img
                width={small.resolution[0]}
                height={small.resolution[1]}
                src={small.path}
                css={{
                    [`@media not all and (max-width: ${SMALLER_FONT_BREAKPOINT}px)`]: {
                        display: "none",
                    },
                }}
            />

        </Link>
    );
};


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
                border: "1.5px solid var(--grey80)",
                padding: "0 12px",
                "&:focus": {
                    outline: "none",
                    boxShadow: "0 0 0 1px var(--accent-color)",
                    borderColor: "var(--accent-color)",
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
                opacity: "0.75",
                "&:hover": {
                    opacity: "1",
                },
                [`@media (max-width: ${SMALLER_FONT_BREAKPOINT}px)`]: {
                    fontSize: 24,
                },
            }}
        >{children}</div>
    </div>
);
