import React from "react";
import { useTranslation, Trans } from "react-i18next";
import { graphql, usePreloadedQuery } from "react-relay";
import type { PreloadedQuery } from "react-relay";

import { Nav } from "../layout/Navigation";
import { Root } from "../layout/Root";
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
        render: () => <About queryRef={queryRef} />,
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

type Props = {
    queryRef: PreloadedQuery<AboutQuery>;
};

const About: React.FC<Props> = ({ queryRef }) => {
    const { t } = useTranslation();
    const result = usePreloadedQuery(query, queryRef);

    return (
        <Root nav={<Nav fragRef={result.realm} />} userQuery={result}>
            <div css={{ margin: "0 auto", maxWidth: 600 }}>
                <h1>{t("about-tobira.title")}</h1>
                <p css={{ margin: "16px 0" }}>
                    <Trans i18nKey="about-tobira.body">
                        Description.
                        <a href="https://github.com/elan-ev/tobira">GitHub repo</a>
                    </Trans>
                </p>
            </div>
        </Root>
    );
};
