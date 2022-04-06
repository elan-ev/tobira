import { useTranslation } from "react-i18next";
import { graphql } from "react-relay";

import { RootLoader } from "../layout/Root";
import { loadQuery } from "../relay";
import { makeRoute } from "../rauta";
import { ErrorPage } from "../ui/error";
import { InvalidUrlQuery } from "./__generated__/InvalidUrlQuery.graphql";


export const InvalidUrlRoute = makeRoute(url => {
    try {
        decodeURIComponent(url.pathname);
    } catch (e) {
        if (e instanceof URIError) {
            const queryRef = loadQuery<InvalidUrlQuery>(query, {});
            return {
                render: () => <RootLoader
                    {...{ query, queryRef }}
                    nav={() => []}
                    render={() => <InvalidUrl />}
                />,
                dispose: () => queryRef.dispose(),
            };
        }
    }
    return null;
});

const query = graphql`
    query InvalidUrlQuery { ... UserData }
`;

export const InvalidUrl: React.FC = () => {
    const { t } = useTranslation();
    return <ErrorPage title={t("invalid-url.title")}>
        {t("invalid-url.description")}
    </ErrorPage>;
};
