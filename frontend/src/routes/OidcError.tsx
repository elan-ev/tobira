import { Trans, useTranslation } from "react-i18next";
import { graphql } from "react-relay";

import { RootLoader } from "../layout/Root";
import { loadQuery } from "../relay";
import { makeRoute } from "../rauta";
import { OidcErrorQuery } from "./__generated__/OidcErrorQuery.graphql";
import { RealmNav } from "../layout/Navigation";
import { Card } from "@opencast/appkit";
import { useTitle } from "../util";
import { ErrorDetails } from "../util/err";


const PATH = "/~oidc/error";

export const OidcErrorRoute = makeRoute({
    url: PATH,
    match: url => {
        if (url.pathname !== PATH) {
            return null;
        }

        const queryRef = loadQuery<OidcErrorQuery>(query, {});
        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                nav={data => <RealmNav fragRef={data.rootRealm} />}
                render={() => <Page url={url} />}
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

const query = graphql`
    query OidcErrorQuery {
        ... UserData
        rootRealm { ... NavigationData }
    }
`;

type Props = {
    url: URL;
};

const Page: React.FC<Props> = ({ url }) => {
    const { t } = useTranslation();

    useTitle(t("errors.oidc-error.title"));

    // Figure out what's wrong
    let message = null;
    let errorDetails = null;

    const errorCode = url.searchParams.get("error");
    if (errorCode === "access_denied") {
        // "The resource owner or authorization server denied the request."
        message = <Trans i18nKey="errors.oidc-error.access-denied" />;
    } else if (errorCode === "temporarily_unavailable" || errorCode === "tobira:unreachable") {
        message = <Trans i18nKey="errors.oidc-error.temporarily-unavailable" />;
    } else {
        // TODO: maybe specifically handle `tobira:state_mismatch`

        message = <Trans i18nKey="errors.oidc-error.internal-error" />;
        errorDetails = "";
        for (const [key, value] of url.searchParams) {
            errorDetails += `${key} = ${value}\n`;
        }
    }

    return (
        <div css={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <Card kind="error" iconPos="top" css={{ maxWidth: 700 }}>
                {message}
            </Card>
            {errorDetails && <ErrorDetails
                summary={t("errors.detailed-error-info")}
                body={errorDetails}
            />}
        </div>
    );
};
