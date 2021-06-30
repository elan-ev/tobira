import { Trans, useTranslation } from "react-i18next";
import { faFrown } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { MAIN_PADDING, OUTER_CONTAINER_MARGIN } from "../layout/Root";
import { Header } from "../layout/Header";
import { Link } from "../router";
import type { Route } from "../router";


export const NotFoundRoute: Route<void> = {
    path: ".*",
    prepare: () => {},
    render: () => <NotFound />,
};

export const NotFound: React.FC = () => {
    const { t } = useTranslation();

    return (
        <div css={{ margin: OUTER_CONTAINER_MARGIN }}>
            <Header hideNavIcon={true} />
            <main css={{
                padding: MAIN_PADDING,
                margin: "0 auto",
                maxWidth: 500,
            }}>
                <FontAwesomeIcon
                    icon={faFrown}
                    css={{ margin: "0 auto", display: "block", fontSize: 90 }}
                />
                <h1 css={{ textAlign: "center", margin: "30px 0" }}>
                    {t("page-not-found.title")}
                </h1>
                <p css={{ margin: "16px 0" }}>{t("page-not-found.explanation")}</p>
                <Trans i18nKey="page-not-found.actions">
                    foo<Link to="/">bar</Link>
                </Trans>
            </main>
        </div>
    );
};
