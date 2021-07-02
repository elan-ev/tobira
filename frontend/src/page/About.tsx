import React from "react";
import { useTranslation, Trans } from "react-i18next";
import { Root } from "../layout/Root";
import type { Route } from "../router";


export const AboutRoute: Route<void> = {
    path: "/about",
    prepare: () => {},
    render: () => <Root><About /></Root>,
};

const About: React.FC = () => {
    const { t } = useTranslation();

    return (
        <div css={{ margin: "0 auto", maxWidth: 600 }}>
            <h1>{t("about.title")}</h1>
            <p css={{ margin: "16px 0" }}>
                <Trans i18nKey="about.body">
                    Description.
                    <a href="https://github.com/elan-ev/tobira">GitHub repo</a>
                </Trans>
            </p>
        </div>
    );
};
