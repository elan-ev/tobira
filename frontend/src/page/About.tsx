import React from "react";
import { useTranslation, Trans } from "react-i18next";


export const About: React.FC = () => {
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
