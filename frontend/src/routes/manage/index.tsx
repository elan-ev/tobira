import { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { NavSource } from "../../layout/Navigation";

import { Root } from "../../layout/Root";
import { Route } from "../../router";
import { PATH as PATH_REALM } from "./Realm";

const PATH = "/~manage";

export const ManageRoute: Route<void> = {
    path: PATH,
    prepare: () => {},
    render: () => <Manage />,
};

const Manage: React.FC = () => {
    const { t } = useTranslation();

    // TODO:
    return (
        <Root navSource={navData(t, PATH)}>
            <h1>{t("manage.overview")}</h1>
        </Root>
    );
};

/** Returns static nav data for "manage" routes */
export const navData = (t: TFunction, currentPath: string): NavSource => {
    const item = (path: string, translationKey: string) => ({
        id: path,
        label: t(translationKey),
        link: path,
        active: path === currentPath,
    });

    return {
        kind: "static" as const,
        data: {
            items: [
                item(PATH, "manage.overview"),
                item(PATH_REALM, "manage.realm.nav-label"),
            ],
            currentName: null,
            parent: null,
        },
    };
};
