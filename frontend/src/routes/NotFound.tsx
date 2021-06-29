import { useTranslation } from "react-i18next";
import type { PreloadedQuery } from "react-relay";

import { Root } from "../layout/Root";
import { rootNavFromQuery, ROOT_NAV_QUERY } from "../layout/Navigation";
import type { Route } from "../router";
import { loadQuery } from "../relay";
import type { NavigationRootQuery } from "../query-types/NavigationRootQuery.graphql";


export const NotFoundRoute: Route<PreloadedQuery<NavigationRootQuery>> = {
    path: ".*",
    prepare: () => loadQuery(ROOT_NAV_QUERY, {}),
    render: queryRef => <NotFound queryRef={queryRef} />,
};

type Props = {
    queryRef: PreloadedQuery<NavigationRootQuery>;
};

const NotFound: React.FC<Props> = ({ queryRef }) => {
    const { t } = useTranslation();

    // TODO: we could add some hints what might went wrong or how to resolve the
    // problem.
    return (
        <Root nav={rootNavFromQuery(queryRef)}>
            <div css={{ margin: "0 auto", maxWidth: 600 }}>
                <h1>{t("page-not-found.title")}</h1>
                <p css={{ margin: "16px 0" }}>{t("page-not-found.body")}</p>
            </div>
        </Root>
    );
};
