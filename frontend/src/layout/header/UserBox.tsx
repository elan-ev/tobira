import { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { FiChevronDown, FiMoreVertical, FiUser } from "react-icons/fi";
import { SMALLER_FONT_BREAKPOINT } from "../../GlobalStyle";
import { User, useUser } from "../../User";

import { ActionIcon } from "./ui";

const BREAKPOINT = 650;

export const UserBox: React.FC = () => {
    const { t } = useTranslation();
    const user = useUser();

    if (user === "unknown") {
        return <UserSettingsIcon t={t} onClick={() => {}} />;
    } else if (user === "none") {
        return <LoggedOut t={t} />;
    } else {
        return <LoggedIn t={t} user={user} />;
    }
};

const BOX_CSS = {
    border: "1px solid var(--grey80)",
    alignSelf: "center",
    borderRadius: 4,
    marginRight: 8,
    cursor: "pointer",
} as const;

type LoggedOutProps = {
    t: TFunction;
};

const LoggedOut: React.FC<LoggedOutProps> = ({ t }) => <>
    <div css={{
        ...BOX_CSS,
        padding: "3px 8px",
        color: "var(--nav-color)",
        "&:hover": {
            boxShadow: "1px 1px 5px var(--grey92)",
        },
        [`@media (max-width: ${BREAKPOINT}px)`]: {
            display: "none",
        },
    }}>{t("user.login")}</div>
    <UserSettingsIcon t={t} onClick={() => {}} />
</>;

type LoggedInProps = {
    t: TFunction;
    user: User;
};

const LoggedIn: React.FC<LoggedInProps> = ({ t, user }) => <>
    {/* Show name in box for large screens */}
    <div
        title={t("user.settings")}
        css={{
            ...BOX_CSS,
            display: "flex",
            alignItems: "center",
            gap: 8,
            maxWidth: 240,
            padding: "3px 3px 3px 10px",
            "& > svg": {
                opacity: 0.75,
            },
            "&:hover": {
                boxShadow: "1px 1px 5px var(--grey92)",
                "& > svg": {
                    opacity: 1,
                },
            },
            [`@media (max-width: ${BREAKPOINT}px)`]: {
                display: "none",
            },
        }}
    >
        <div css={{
            flex: "0 1 auto",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            overflow: "hidden",
        }}>{user.displayName}</div>
        <FiChevronDown css={{ fontSize: 28, minWidth: 28 }} />
    </div>

    {/* Only show icon for small screens */}
    {/* TODO: find a way to signal the user is logged in */}
    <ActionIcon
        title={t("user.settings")}
        onClick={() => {}}
        extraCss={{
            [`@media not all and (max-width: ${BREAKPOINT}px)`]: {
                display: "none",
            },
        }}
    >
        <FiUser />
    </ActionIcon>
</>;

type UserSettingsIconProps = {
    t: TFunction;
    onClick: () => void;
};

const UserSettingsIcon: React.FC<UserSettingsIconProps> = ({ t, onClick }) => (
    <ActionIcon title={t("user.settings")} onClick={onClick}>
        <FiMoreVertical css={{
            fontSize: 26,
            [`@media (max-width: ${SMALLER_FONT_BREAKPOINT}px)`]: {
                fontSize: 22,
            },
        }} />
    </ActionIcon>
);
