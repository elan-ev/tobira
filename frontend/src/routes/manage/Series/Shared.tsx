import { useTranslation } from "react-i18next";
import { LuShieldCheck, LuPenLine, LuEye } from "react-icons/lu";
import { graphql } from "react-relay";

import { RootLoader } from "../../../layout/Root";
import { makeRoute, Route } from "../../../rauta";
import { loadQuery } from "../../../relay";
import { NotFound } from "../../NotFound";
import { b64regex } from "../../util";
import { seriesId, keyOfId } from "../../../util";
import CONFIG from "../../../config";
import { ManageSeriesRoute, SingleSeries } from ".";
import { SharedSeriesManageQuery } from "./__generated__/SharedSeriesManageQuery.graphql";
import { DirectSeriesRoute } from "../../Series";
import { ReturnLink, ManageNav, SharedManageNavProps } from "../Shared/Nav";
import { COLORS } from "../../../color";
import { ThumbnailStack } from "../../../ui/ThumbnailStack";


export const PAGE_WIDTH = 1100;

export type QueryResponse = SharedSeriesManageQuery["response"];
export type Series = NonNullable<QueryResponse["series"]>;

type ManageSeriesSubPageType = "details" | "acl";

/** Helper around `makeRoute` for manage single series subpages. */
export const makeManageSeriesRoute = (
    page: ManageSeriesSubPageType,
    path: `/${string}` | "",
    render: (series: Series, data: QueryResponse) => JSX.Element,
): Route & { url: (args: { seriesId: string }) => string } => (
    makeRoute({
        url: ({ seriesId }: { seriesId: string }) => `/~manage/series/${keyOfId(seriesId)}${path}`,
        match: url => {
            const regex = new RegExp(`^/~manage/series/(${b64regex}+)${path}/?$`, "u");
            const params = regex.exec(url.pathname);
            if (params === null) {
                return null;
            }

            const id = decodeURIComponent(params[1]);
            const queryRef = loadQuery<SharedSeriesManageQuery>(query, {
                id: seriesId(id),
            });

            return {
                render: () => <RootLoader
                    {...{ query, queryRef }}
                    noindex
                    nav={data => data.series ? [
                        <ReturnLink
                            key={1}
                            url={ManageSeriesRoute.url}
                            title="manage.my-series.title"
                        />,
                        <ManageSeriesNav key={2} series={data.series} active={page} />,
                    ] : []}
                    render={data => {
                        if (data.series == null) {
                            return <NotFound kind="series" />;
                        }
                        return render(data.series, data);
                    }}
                />,
                dispose: () => queryRef.dispose(),
            };
        },
    })
);


const query = graphql`
    query SharedSeriesManageQuery($id: ID!) {
        ...UserData
        ...AccessKnownRolesData
        series: seriesById(id: $id) {
            id
            title
            created
            updated
            acl { role actions info { label implies large } }
            description
            state
            entries {
                __typename
                ...on AuthorizedEvent {
                    id
                    isLive
                    title
                    created
                    creators
                    description
                    canWrite
                    syncedData { thumbnail audioOnly duration startTime endTime }
                }
            }
            hostRealms { id isMainRoot name path }
        }
    }
`;


type ManageSeriesNavProps = SharedManageNavProps & {
    series: Series;
};

const ManageSeriesNav: React.FC<ManageSeriesNavProps> = ({ series, active }) => {
    const { t } = useTranslation();

    if (series == null) {
        return null;
    }

    const id = keyOfId(series.id);

    const navEntries = [
        {
            url: `/~manage/series/${id}`,
            page: "details",
            body: <><LuPenLine />{t("manage.my-series.details.title")}</>,
        },
    ];

    if (CONFIG.allowAclEdit) {
        navEntries.splice(1, 0, {
            url: `/~manage/series/${id}/access`,
            page: "acl",
            body: <><LuShieldCheck />{t("manage.shared.acl.title")}</>,
        });
    }

    const link = DirectSeriesRoute.url({ seriesId: id });
    const title = series.title;
    const ariaLabel = t("series.series-page", { series: series.title });

    const additionalStyles = {
        padding: 8,
        borderBottom: `2px solid ${COLORS.neutral05}`,
    };

    const thumbnail = <>
        <LuEye />
        <SeriesThumbnail series={{
            ...series,
            thumbnailStack: {
                thumbnails: series.entries.slice(0, 3).map(entry => {
                    if (entry.__typename !== "AuthorizedEvent") {
                        return {
                            audioOnly: false,
                            live: false,
                            url: null,
                        };
                    }
                    return {
                        url: entry.syncedData?.thumbnail,
                        audioOnly: entry.syncedData?.audioOnly ?? false,
                        live: entry.isLive,
                    };
                }),
            },
        }} />
    </>;

    return <ManageNav {...{
        active,
        link,
        ariaLabel,
        title,
        thumbnail,
        navEntries,
        additionalStyles,
    }} />;
};

type SeriesThumbnailProps = {
    series: Pick<SingleSeries, "title" | "thumbnailStack">;
    deletionIsPending?: boolean;
}

export const SeriesThumbnail: React.FC<SeriesThumbnailProps> = ({ series, deletionIsPending }) => (
    <div css={{ "> div": { width: "100%" } }}>
        <ThumbnailStack
            thumbnails={series.thumbnailStack.thumbnails}
            title={series.title}
            {...{ deletionIsPending }}
        />
    </div>
);
