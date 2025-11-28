import { graphql, useFragment } from "react-relay";
import { useTranslation } from "react-i18next";

import { loadQuery } from "../relay";
import { makeRoute } from "../rauta";
import { SeriesBlockFromSeries } from "../ui/Blocks/Series";
import { InitialLoading, RootLoader } from "../layout/Root";
import { RealmNav } from "../layout/Navigation";
import { PageTitle } from "../layout/header/ui";
import { WaitingPage } from "../ui/Waiting";
import { isSynced, keyOfId, seriesId } from "../util";

import { NotFound } from "./NotFound";
import { b64regex } from "./util";
import { SeriesByIdQuery } from "./__generated__/SeriesByIdQuery.graphql";
import { SeriesRouteData$key } from "./__generated__/SeriesRouteData.graphql";
import { Breadcrumbs } from "../ui/Breadcrumbs";
import { isValidRealmPath } from "./Realm";
import { useRouter } from "../router";
import { useEffect } from "react";
import { SeriesPageRealmData$key } from "./__generated__/SeriesPageRealmData.graphql";
import { realmBreadcrumbs } from "../util/realm";
import {
    SeriesDirectByOpencastIdQuery,
} from "./__generated__/SeriesDirectByOpencastIdQuery.graphql";
import { SeriesDirectByIdQuery } from "./__generated__/SeriesDirectByIdQuery.graphql";
import { SeriesByOcIdQuery } from "./__generated__/SeriesByOcIdQuery.graphql";


export const SeriesRoute = makeRoute({
    url: ({ realmPath, seriesId }: { realmPath: string; seriesId: string }) =>
        `${realmPath === "/" ? "" : realmPath}/s/${keyOfId(seriesId)}`,
    match: url => {
        const params = checkSeriesRealmPath(url, b64regex);
        if (params == null) {
            return null;
        }
        const query = graphql`
            query SeriesByIdQuery($id: ID!, $realmPath: String!) {
                ... UserData
                series: seriesById(id: $id) {
                    ...SeriesRouteData
                    isReferencedByRealm(path: $realmPath)
                }
                realm: realmByPath(path: $realmPath) {
                    ... NavigationData
                    ... SeriesPageRealmData
                }
            }
        `;
        const queryRef = loadQuery<SeriesByIdQuery>(query, {
            id: seriesId(params.seriesId),
            realmPath: params.realmPath,
        });


        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={data => data.realm ? <RealmNav fragRef={data.realm} /> : []}
                render={({ series, realm }) => {
                    if (!realm || series?.isReferencedByRealm === false) {
                        return <ForwardToDirectRoute seriesId={params.seriesId} />;
                    }

                    return <SeriesPage
                        seriesRef={series}
                        realmRef={realm}
                        realmPath={params.realmPath}
                    />;
                }}
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

export const OpencastSeriesRoute = makeRoute({
    url: ({ realmPath, seriesOcId }: { realmPath: string; seriesOcId: string }) =>
        `${realmPath === "/" ? "" : realmPath}/s/:${seriesOcId}`,
    match: url => {
        const params = checkSeriesRealmPath(url, ":([^/]+)");
        if (params == null) {
            return null;
        }
        params.seriesId = params.seriesId.substring(1);

        const query = graphql`
            query SeriesByOcIdQuery($id: String!, $realmPath: String!) {
                ... UserData
                series: seriesByOpencastId(id: $id) {
                    ...SeriesRouteData
                    isReferencedByRealm(path: $realmPath)
                }
                realm: realmByPath(path: $realmPath) {
                    ... NavigationData
                    ... SeriesPageRealmData
                }
            }
        `;
        const queryRef = loadQuery<SeriesByOcIdQuery>(query, {
            id: params.seriesId,
            realmPath: params.realmPath,
        });


        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={data => data.realm ? <RealmNav fragRef={data.realm} /> : []}
                render={({ series, realm }) => {
                    if (!realm || series?.isReferencedByRealm === false) {
                        return <ForwardToDirectRoute seriesId={params.seriesId} />;
                    }

                    return <SeriesPage
                        seriesRef={series}
                        realmRef={realm}
                        realmPath={params.realmPath}
                    />;
                }}
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

const ForwardToDirectRoute: React.FC<{ seriesId: string }> = ({ seriesId }) => {
    const router = useRouter();
    useEffect(() => router.goto(DirectSeriesRoute.url({ seriesId }), true));
    return <InitialLoading />;
};

const checkSeriesRealmPath = (url: URL, idRegex: string) => {
    const urlPath = url.pathname.replace(/^\/|\/$/g, "");
    const parts = urlPath.split("/").map(decodeURIComponent);
    if (parts.length < 2) {
        return null;
    }
    if (parts[parts.length - 2] !== "s") {
        return null;
    }
    const seriesId = parts[parts.length - 1];
    if (!seriesId.match(idRegex)) {
        return null;
    }

    const realmPathParts = parts.slice(0, parts.length - 2);
    if (!isValidRealmPath(realmPathParts)) {
        return null;
    }

    const realmPath = "/" + realmPathParts.join("/");

    return { realmPath, seriesId };
};

export const DirectSeriesOCRoute = makeRoute({
    url: ({ ocID }: { ocID: string }) => `/!s/:${ocID}`,
    match: url => {
        const regex = new RegExp("^/!s/:([^/]+)$", "u");
        const matches = regex.exec(url.pathname);

        if (!matches) {
            return null;
        }


        const opencastId = decodeURIComponent(matches[1]);
        const query = graphql`
            query SeriesDirectByOpencastIdQuery($id: String!) {
                ... UserData
                series: seriesByOpencastId(id: $id) { ...SeriesRouteData }
                rootRealm { ... NavigationData, ... SeriesPageRealmData }
            }
        `;
        const queryRef = loadQuery<SeriesDirectByOpencastIdQuery>(query, { id: opencastId });


        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={data => <RealmNav fragRef={data.rootRealm} />}
                render={result => <SeriesPage
                    seriesRef={result.series}
                    realmRef={result.rootRealm}
                    realmPath={null}
                />}
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

export const DirectSeriesRoute = makeRoute({
    url: ({ seriesId }: { seriesId: string }) => `/!s/${keyOfId(seriesId)}`,
    match: url => {
        const regex = new RegExp(`^/!s/(${b64regex}+)$`, "u");
        const matches = regex.exec(url.pathname);

        if (!matches) {
            return null;
        }


        const id = decodeURIComponent(matches[1]);
        const query = graphql`
            query SeriesDirectByIdQuery($id: ID!) {
                ... UserData
                series: seriesById(id: $id) { ...SeriesRouteData }
                rootRealm { ... NavigationData, ... SeriesPageRealmData }
            }
        `;
        const queryRef = loadQuery<SeriesDirectByIdQuery>(query, { id: seriesId(id) });


        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={data => <RealmNav fragRef={data.rootRealm} />}
                render={result => <SeriesPage
                    seriesRef={result.series}
                    realmRef={result.rootRealm}
                    realmPath={null}
                />}
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

const realmFragment = graphql`
    fragment SeriesPageRealmData on Realm {
        name
        path
        isMainRoot
        ancestors { name path }
    }
`;

const fragment = graphql`
    fragment SeriesRouteData on Series {
        title
        description
        state
        ... SeriesBlockSeriesData
    }
`;

type SeriesPageProps = {
    seriesRef?: SeriesRouteData$key | null;
    realmRef: NonNullable<SeriesPageRealmData$key>;
    realmPath: string | null;
};

const SeriesPage: React.FC<SeriesPageProps> = ({ seriesRef, realmRef, realmPath }) => {
    const { t } = useTranslation();
    const series = useFragment(fragment, seriesRef ?? null);
    const realm = useFragment(realmFragment, realmRef);
    const breadcrumbs = realm.isMainRoot ? [] : realmBreadcrumbs(t, realm.ancestors.concat(realm));

    if (!series) {
        return <NotFound kind="series" breadcrumbsPath={breadcrumbs} />;
    }

    if (!isSynced(series)) {
        return <WaitingPage type="series" />;
    }

    // There is no point in repeating the same name twice in the breadcrumbs.
    // This check is not "super clean", as title equality here doesn't mean
    // that the realm is actually deriving the name from this series. But
    // either way, showing the same string a second time doesn't help with
    // anything.
    const tail = series.title === realm.name
        ? <i>{t("series.singular")}</i>
        : series.title;

    return <div css={{ display: "flex", flexDirection: "column" }}>
        <Breadcrumbs path={breadcrumbs} tail={tail} />
        <PageTitle title={series.title} />
        <SeriesBlockFromSeries
            showMetadata
            realmPath={realmPath}
            fragRef={series}
        />
    </div>;
};
