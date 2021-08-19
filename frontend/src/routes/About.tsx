import React from "react";
import { useTranslation, Trans } from "react-i18next";
import { usePreloadedQuery } from "react-relay";
import type { PreloadedQuery } from "react-relay";

import { Nav, navFromQuery, ROOT_NAV_QUERY } from "../layout/Navigation";
import { Root } from "../layout/Root";
import type { NavigationRootQuery } from "../query-types/NavigationRootQuery.graphql";
import { loadQuery } from "../relay";
import type { Route } from "../router";


export const AboutRoute: Route<PreloadedQuery<NavigationRootQuery>> = {
    path: "/~tobira",
    prepare: () => loadQuery(ROOT_NAV_QUERY, {}),
    render: queryRef => <About queryRef={queryRef} />,
};

type Props = {
    queryRef: PreloadedQuery<NavigationRootQuery>;
};

const About: React.FC<Props> = ({ queryRef }) => {
    const { t } = useTranslation();
    const { realm } = usePreloadedQuery(ROOT_NAV_QUERY, queryRef);

    return (
        <Root nav={<Nav source={navFromQuery(realm)} />}>
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
