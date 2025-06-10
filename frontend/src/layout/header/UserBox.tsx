import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    LuTriangleAlert, LuLogIn, LuMoon, LuSun, LuFolder, LuFilm,
    LuUpload, LuVideo, LuLogOut, LuChevronDown, LuUserCheck,
    LuCirclePlus,
} from "react-icons/lu";
import { HiOutlineFire, HiOutlineTranslate } from "react-icons/hi";
import {
    match, ProtoButton, screenWidthAbove, screenWidthAtMost, Spinner,
    HeaderMenuItemDef, HeaderMenuProps, WithHeaderMenu, checkboxMenuItem, useColorScheme,
    Button,
    WithTooltip,
} from "@opencast/appkit";

import { BREAKPOINT_MEDIUM } from "../../GlobalStyle";
import i18n, { languages } from "../../i18n";
import { Link } from "../../router";
import { User, useUser } from "../../User";
import { ActionIcon, ICON_STYLE } from "./ui";
import CONFIG from "../../config";
import { focusStyle } from "../../ui";
import { ExternalLink } from "../../relay/auth";
import { COLORS } from "../../color";
import { translatedConfig } from "../../util";
import { UploadRoute } from "../../routes/Upload";
import { ManageRoute } from "../../routes/manage";
import { ManageVideosRoute } from "../../routes/manage/Video";
import { LoginLink } from "../../routes/util";
import { CREDENTIALS_STORAGE_KEY } from "../../routes/Video";
import { ManageSeriesRoute } from "../../routes/manage/Series";
import SeriesIcon from "../../icons/series.svg";
import { CreateSeriesRoute } from "../../routes/manage/Series/Create";
import { TranslationModal } from "../../routes/Translations";



/** User-related UI in the header. */
export const UserBox: React.FC = () => {
    const { t } = useTranslation();
    const user = useUser();

    const [isModalOpen, setIsModalOpen] = React.useState(false);

    useEffect(() => {
        const handleShortcut = (event: KeyboardEvent) => {
            // If any element is focussed that could receive character input, we
            // don't do anything.
            if (/^input|textarea|select$/i.test(document.activeElement?.tagName ?? "")) {
                return;
            }

            // With ctrl and meta key, this could be bound to some other
            // shortcut (ctrl+s) that we want to ignore.
            if (event.ctrlKey || event.metaKey) {
                return;
            }

            if (event.key === "t" || event.key === "T") {
                setIsModalOpen(true);
            }

            if (event.key === "l" || event.key === "L") {
                event.preventDefault();
                const currentLanguage = i18n.language;
                const languageKeys = Object.keys(languages);
                const currentIndex = languageKeys.indexOf(currentLanguage);
                const nextIndex = (currentIndex + 1) % languageKeys.length;
                i18n.changeLanguage(languageKeys[nextIndex]);
            }

            if (event.key === "1") {
                i18n.changeLanguage("en");
            }

            if (event.key === "2") {
                i18n.changeLanguage("de");
            }

            if (event.key === "3") {
                i18n.changeLanguage("it");
            }

            if (event.key === "4") {
                i18n.changeLanguage("fr");
            }
        };

        document.addEventListener("keyup", handleShortcut);
        return () => document.removeEventListener("keyup", handleShortcut);
    }, []);

    const iconCss = {
        height: "100%",
        margin: "0 9px",
        fontSize: 22,
        opacity: 0.4,
    };

    let boxContent;
    if (user === "unknown") {
        boxContent = <Spinner css={iconCss} />;
    } else if (user === "error") {
        // TODO: tooltip
        boxContent = <LuTriangleAlert css={iconCss} />;
    } else if (user === "none") {
        boxContent = <LoggedOut />;
    } else {
        boxContent = <LoggedIn {...{ t, user }} />;
    }

    return <>
        <WithTooltip tooltip={"Press 't' to manage translations, 'l' to change language"}>
            <Button
                kind="call-to-action"
                onClick={() => setIsModalOpen(true)}
                css={{
                    "&&": {
                        height: 38,
                        border: "none",
                        ...focusStyle({ offset: 1 }),
                        ":hover, :focus": {
                            border: "none",
                            backgroundColor: COLORS.primary1,
                            color: COLORS.primary1BwInverted,
                        },
                    },
                }}
            >
                Manage translations
            </Button>
        </WithTooltip>

        <TranslationModal open={isModalOpen} onClose={() => setIsModalOpen(false)} />
        <LanguageSettings />
        <ColorSchemeSettings />
        {boxContent}
    </>;
};


/** User-related UI in header when the user is NOT logged in. */
const LoggedOut: React.FC = () => {
    const { t } = useTranslation();

    return (
        <LoginLink
            css={{
                /* Show labelled button on larger screens. */
                [screenWidthAbove(BREAKPOINT_MEDIUM)]: {
                    color: COLORS.primary0BwInverted,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginLeft: 4,
                    borderRadius: 8,
                    padding: "7px 14px",
                    backgroundColor: COLORS.primary0,
                    textDecoration: "none",
                    svg: { fontSize: 20 },
                    ":hover, :focus": {
                        backgroundColor: COLORS.primary1,
                        color: COLORS.primary1BwInverted,
                    },
                    ...focusStyle({ offset: 1 }),
                },
                /* Show only the icon on mobile devices. */
                [screenWidthAtMost(BREAKPOINT_MEDIUM)]: {
                    color: COLORS.neutral90,
                    ...ICON_STYLE,
                    span: { display: "none" },
                },
            }}
        >
            <LuLogIn />
            <span>{t("user.login")}</span>
        </LoginLink>
    );
};

/** Header button and associated floating menu to choose between color schemes */
export const ColorSchemeSettings: React.FC = () => {
    const { t } = useTranslation();
    const { scheme, isAuto, update } = useColorScheme();

    const currentPref = isAuto ? "auto" : scheme;
    const choices = ["auto", "light", "dark"] as const;
    const menuItems: HeaderMenuItemDef[] = choices.map(choice => checkboxMenuItem({
        checked: currentPref === choice,
        children: <>{t(`main-menu.color-scheme.${choice}`)}</>,
        onClick: () => update(choice),
    }));

    return (
        <WithHeaderMenu
            menu={{
                label: t("main-menu.color-scheme.label"),
                items: menuItems,
                breakpoint: BREAKPOINT_MEDIUM,
            }}
        >
            <ActionIcon title={t("main-menu.color-scheme.label")}>
                {scheme === "light" ? <LuMoon /> : <LuSun />}
            </ActionIcon>
        </WithHeaderMenu>
    );
};

/** Header button and associated floating menu to choose between languages */
export const LanguageSettings: React.FC = () => {
    const { t, i18n } = useTranslation();
    const isCurrentLanguage = (language: string) => language === i18n.resolvedLanguage;

    const menuItems = Object.keys(languages).map(lng => checkboxMenuItem({
        checked: isCurrentLanguage(lng),
        children: <>{t("general.language.name", { lng })}</>,
        onClick: () => {
            if (!isCurrentLanguage(lng)) {
                i18n.changeLanguage(lng);
            }
        },
    }));

    const label = t("general.language.language_one");
    return (
        <WithHeaderMenu
            menu={{
                label,
                items: menuItems,
                breakpoint: BREAKPOINT_MEDIUM,
            }}
        >
            <ActionIcon title={t("general.language.selection")}>
                <HiOutlineTranslate />
                <span css={{
                    fontSize: 14,
                }}>
                    {i18n.resolvedLanguage}
                </span>
            </ActionIcon>
        </WithHeaderMenu>
    );
};


type LoggedInProps = {
    user: User;
};

/** User-related UI in header when the user IS logged in. */
const LoggedIn: React.FC<LoggedInProps> = ({ user }) => {
    const { t } = useTranslation();

    type LogoutState = "idle" | "pending" | "error";
    const [logoutState, setLogoutState] = useState<LogoutState>("idle");
    const deleteSession = () => {
        // We don't do anything if a request is already pending.
        if (logoutState === "pending") {
            return;
        }

        Object.keys(window.localStorage)
            .filter(item => item.startsWith(CREDENTIALS_STORAGE_KEY))
            .forEach(item => window.localStorage.removeItem(item));

        setLogoutState("pending");
        fetch("/~session", { method: "DELETE", keepalive: true })
            .then(() => {
                if (CONFIG.auth.logoutLink === null) {
                    // We deliberately ignore the `status`. See `handle_logout` for
                    // more information.
                    //
                    // We hard forward to the home page to get rid of any stale state.
                    window.location.href = "/";
                }
            })
            .catch(error => {
                // TODO: this is not great. It should happen only extremely
                // rarely, but still, just showing a triangle is not very great
                // for the user.

                // eslint-disable-next-line no-console
                console.error("Error during logout: ", error);
                setLogoutState("error");
            });
    };

    const indent = { paddingLeft: 30 };
    const items: HeaderMenuProps["items"] = [
        {
            icon: <LuFolder />,
            wrapper: <Link to={ManageRoute.url} />,
            children: t("user.manage"),
            css: { minWidth: 200 },
        },
        ...user.canCreateUserRealm ? [{
            icon: <HiOutlineFire />,
            wrapper: <Link to={`/@${user.username}`} />,
            children: t("realm.user-realm.my-page"),
            css: indent,
        }] : [],
        {
            icon: <LuFilm />,
            wrapper: <Link to={ManageVideosRoute.url} />,
            children: t("manage.video.table"),
            css: indent,
        },
        ...user.canUpload ? [{
            icon: <LuUpload />,
            wrapper: <Link to={UploadRoute.url()} />,
            children: t("upload.title"),
            css: indent,
        }] : [],
        ...user.canUseStudio ? [{
            icon: <LuVideo />,
            wrapper: <ExternalLink
                service="STUDIO"
                params={{
                    "return.target": document.location.href,
                    "return.label": translatedConfig(CONFIG.siteTitle, i18n),
                }}
                fallback="link"
            />,
            keepOpenAfterClick: true,
            children: t("manage.dashboard.studio-title"),
            css: { ...indent, width: "100%" },
        }] : [],
        {
            icon: <SeriesIcon />,
            wrapper: <Link to={ManageSeriesRoute.url} />,
            children: t("manage.series.table.title"),
            css: indent,
        },
        ...user.canCreateSeries ? [{
            icon: <LuCirclePlus />,
            wrapper: <Link to={CreateSeriesRoute.url} />,
            children: t("manage.series.table.create"),
            css: indent,
        }] : [],

        // Logout button
        {
            icon: match(logoutState, {
                "idle": () => <LuLogOut />,
                "pending": () => <Spinner />,
                "error": () => <LuTriangleAlert />,
            }),
            children: t("user.logout"),
            css: {
                "&&": {
                    color: COLORS.danger0,
                    width: "100%",
                },
            },
            ...CONFIG.auth.logoutLink !== null
                ? {
                    wrapper: <Link
                        to={CONFIG.auth.logoutLink}
                        onClick={CONFIG.auth.usesTobiraSessions ? deleteSession : () => {}}
                        htmlLink
                    />,
                }
                : {
                    keepOpenAfterClick: true,
                    wrapper: <ProtoButton onClick={deleteSession} />,
                },
        },
    ];

    const menuProps = {
        label: user.displayName,
        breakpoint: BREAKPOINT_MEDIUM,
        items,
    };

    return <WithHeaderMenu menu={menuProps}>
        <div css={{ position: "relative" }}>
            <ProtoButton title={t("user.settings")} css={{
                display: "flex",
                alignItems: "center",
                backgroundColor: COLORS.neutral05,
                border: `1px solid ${COLORS.neutral40}`,
                gap: 12,
                borderRadius: 8,
                padding: "8px 10px 8px 16px",
                cursor: "pointer",
                ":hover": {
                    borderColor: COLORS.neutral25,
                    outline: `2.5px solid ${COLORS.neutral25}`,
                    outlineOffset: -1,
                },
                ":focus-visible": { borderColor: COLORS.focus },
                ...focusStyle({ offset: -1 }),
                [screenWidthAtMost(BREAKPOINT_MEDIUM)]: {
                    display: "none",
                },
            }}>
                <span css={{
                    maxWidth: "clamp(170px, 12vw, 230px)",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                    overflow: "hidden",
                }}>
                    {user.displayName}
                </span>
                <LuChevronDown size={20}/>
            </ProtoButton>
            {/* Show icon on mobile devices. */}
            <ActionIcon
                title={t("user.settings")}
                css={{
                    [screenWidthAbove(BREAKPOINT_MEDIUM)]: {
                        display: "none",
                    },
                }}>
                <LuUserCheck css={{ polyline: { stroke: COLORS.happy1 } }}/>
            </ActionIcon>
        </div>
    </WithHeaderMenu>;
};
