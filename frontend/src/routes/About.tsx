import React from "react";
import { useTranslation, Trans } from "react-i18next";
import type { PreloadedQuery } from "react-relay";

import { rootNavFromQuery, ROOT_NAV_QUERY } from "../layout/Navigation";
import { Root } from "../layout/Root";
import type { NavigationRootQuery } from "../query-types/NavigationRootQuery.graphql";
import { loadQuery } from "../relay";
import type { Route } from "../router";


export const AboutRoute: Route<PreloadedQuery<NavigationRootQuery>> = {
    path: "/about",
    prepare: () => loadQuery(ROOT_NAV_QUERY, {}),
    render: queryRef => <About queryRef={queryRef} />,
};

type Props = {
    queryRef: PreloadedQuery<NavigationRootQuery>;
};

const About: React.FC<Props> = ({ queryRef }) => {
    const { t } = useTranslation();

    return (
        <Root nav={rootNavFromQuery(queryRef)}>
            <div css={{ margin: "0 auto", maxWidth: 600 }}>
                <h1>{t("about.title")}</h1>
                <p css={{ margin: "16px 0" }}>
                    <Trans i18nKey="about.body">
                        Description.
                        <a href="https://github.com/elan-ev/tobira">GitHub repo</a>
                    </Trans>
                </p>
            </div>
        </Root>
    );
};
