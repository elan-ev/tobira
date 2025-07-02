import { Trans, useTranslation } from "react-i18next";
import { graphql } from "react-relay";
import { match } from "@opencast/appkit";

import { RootLoader } from "../layout/Root";
import { Link } from "../router";
import { useNoindexTag } from "../util";
import { loadQuery } from "../relay";
import { NotFoundQuery } from "./__generated__/NotFoundQuery.graphql";
import { LuFrown } from "react-icons/lu";
import { PageTitle } from "../layout/header/ui";
import { CenteredContent } from "../ui";
import { Breadcrumbs, Props as BreadcrumbsProps } from "../ui/Breadcrumbs";


export const NotFoundRoute = {
    prepare: () => {
        const queryRef = loadQuery<NotFoundQuery>(query, {});
        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                nav={() => []}
                render={() => <NotFound kind="page" />}
            />,
            dispose: () => queryRef.dispose(),
        };
    },
};

const query = graphql`
    query NotFoundQuery { ... UserData }
`;

type Props = {
    kind: "page" | "video" | "series" | "playlist";
    breadcrumbsPath?: BreadcrumbsProps["path"],
};

export const NotFound: React.FC<Props> = ({ kind, breadcrumbsPath }) => {
    const { t } = useTranslation();
    const title = match(kind, {
        "page": () => t("not-found.page-not-found"),
        "video": () => t("not-found.video-not-found"),
        "series": () => t("not-found.series-not-found"),
        "playlist": () => t("not-found.playlist-not-found"),
    });

    // Ideally our backend would respond with 404 here, but that's not
    // implemented yet and takes a bit of effort. For SEO it helps if we declare
    // this page as noindex. See Google's advice on "soft 404" in SPAs:
    //

    // https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics#avoid-soft-404s
    useNoindexTag();

    return <>
        <Breadcrumbs path={breadcrumbsPath ?? []} tail={<i>{title}</i>} />
        <LuFrown css={{ margin: "0 auto", display: "block", fontSize: 90 }} />
        <PageTitle
            title={title}
            css={{ textAlign: "center", margin: "32px 0 48px 0 !important" }}
        />
        <CenteredContent>
            <p css={{ margin: "16px 0" }}>
                {match(kind, {
                    "page": () => t("not-found.page-explanation"),
                    "video": () => t("not-found.video-explanation"),
                    "series": () => t("not-found.series-explanation"),
                    "playlist": () => t("not-found.playlist-explanation"),
                })}
                {t("not-found.url-typo")}
            </p>
            <Trans i18nKey="not-found.actions">
                You can try visiting <Link to="/">the homepage</Link> or using
                the search bar to find the page you are looking for.
            </Trans>
        </CenteredContent>
    </>;
};
