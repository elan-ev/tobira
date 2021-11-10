import { useTranslation } from "react-i18next";

import { Root } from "../../layout/Root";
import { makeRoute } from "../../rauta";

const PATH = "/~manage";

export const ManageRoute = makeRoute<void>({
    path: PATH,
    queryParams: [],
    prepare: () => {},
    render: () => <Manage />,
});

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
