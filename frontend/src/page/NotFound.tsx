import React from "react";
import { useTranslation } from "react-i18next";
import { Root } from "../layout/Root";
import type { Route } from "../router";


export const NotFoundRoute: Route<void> = {
    path: "*",
    prepare: () => {},
    render: () => <Root><NotFound /></Root>,
};

const NotFound: React.FC = () => {
    const { t } = useTranslation();

    // TODO: we could add some hints what might went wrong or how to resolve the
    // problem.
    return (
        <div css={{ margin: "0 auto", maxWidth: 600 }}>
            <h1>{t("page-not-found.title")}</h1>
            <p css={{ margin: "16px 0" }}>{t("page-not-found.body")}</p>
        </div>
    );
};
