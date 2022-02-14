import React from "react";
import { useTranslation, Trans } from "react-i18next";
import { graphql } from "react-relay";

import { Nav } from "../layout/Navigation";
import { RootLoader } from "../layout/Root";
import { loadQuery } from "../relay";
import { AboutQuery } from "./__generated__/AboutQuery.graphql";
import { ABOUT_PATH } from "./paths";
import { makeRoute } from "../rauta";


export const AboutRoute = makeRoute(url => {
    if (url.pathname !== ABOUT_PATH) {
        return null;
    }

    const queryRef = loadQuery<AboutQuery>(query, {});
    return {
        render: () => <RootLoader
            {...{ query, queryRef }}
            nav={data => <Nav fragRef={data.realm} />}
            render={() => <About />}
        />,
        dispose: () => queryRef.dispose(),
    };
});

const query = graphql`
    query AboutQuery {
        ... UserData
        realm: rootRealm {
            ... NavigationData
        }
    }
`;

const About: React.FC = () => {
    const { t } = useTranslation();

    return (
        <div css={{ margin: "0 auto", maxWidth: 600 }}>
            <h1>{t("about-tobira.title")}</h1>
            <p css={{ margin: "16px 0" }}>
                <Trans i18nKey="about-tobira.body">
                    Description.
                    <a href="https://github.com/elan-ev/tobira">GitHub repo</a>
                </Trans>
            </p>
        </div>
    );
};
