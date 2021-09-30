import { useTranslation } from "react-i18next";
import { FiUser } from "react-icons/fi";
import { useUser } from "../../User";

import { ActionIcon } from "./ui";


export const UserBox: React.FC = () => {
    const { t } = useTranslation();
    const user = useUser();

    if (user === "unknown") {
        return <Placeholder />;
    } else if (user === "none") {
        // TODO
        return <Placeholder />;
    } else {
        // TODO
        return (
            <div css={{ height: "100%", display: "flex", alignItems: "center", gap: 16 }}>
                <div>
                    <div css={{ fontSize: 12, color: "var(--grey40)" }}>
                        {t("user.logged-in-as")}
                    </div>
                    {user.displayName}
                </div>
                <FiUser css={{ fontSize: 28 }} />
            </div>
        );
    }
};

const Placeholder: React.FC = () => {
    const { t } = useTranslation();

    return (
        <ActionIcon title={t("user.settings")} onClick={() => {}}>
            <FiUser />
        </ActionIcon>
    );
};
