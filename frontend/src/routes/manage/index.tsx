import { useTranslation } from "react-i18next";
import { Nav } from "../../layout/Navigation";

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
        <Root nav={<ManageNav currentPath={PATH} />}>
            <h1>{t("manage.overview")}</h1>
        </Root>
    );
};

type ManageNavProps = {
    currentPath: string;
};

export const ManageNav: React.FC<ManageNavProps> = ({ currentPath }) => {
    const { t } = useTranslation();
    const item = (path: string, translationKey: string) => ({
        id: path,
        label: t(translationKey),
        link: path,
        active: path === currentPath,
    });

    return <Nav source={{
        kind: "static",
        data: {
            items: [
                item(PATH, "manage.overview"),
                item(PATH_REALM, "manage.realm.nav-label"),
            ],
            currentName: null,
            parent: null,
        },
    }} />;
};
