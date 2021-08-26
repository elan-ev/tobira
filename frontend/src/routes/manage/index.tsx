import { useTranslation } from "react-i18next";

import { Root } from "../../layout/Root";
import { Route } from "../../router";

const PATH = "/~manage";

export const ManageRoute: Route<void> = {
    path: PATH,
    prepare: () => {},
    render: () => <Manage />,
};

const Manage: React.FC = () => {
    const { t } = useTranslation();

    // TODO
    return (
        <Root nav={[]}>
            <h1>{t("manage.overview")}</h1>
            <p>TODO</p>
        </Root>
    );
};
