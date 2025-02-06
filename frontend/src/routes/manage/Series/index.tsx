import { Fragment } from "react";
import { graphql } from "react-relay";
import i18n from "../../../i18n";
import { match } from "@opencast/appkit";

import { ManageNav } from "..";
import { RootLoader } from "../../../layout/Root";
import { makeRoute } from "../../../rauta";
import { loadQuery } from "../../../relay";
import { NotAuthorized } from "../../../ui/error";
import {
    ColumnProps,
    createQueryParamsParser,
    DateColumn,
    ManageAssets,
    TableRow,
} from "../Shared/Table";
import {
    SeriesManageQuery,
    SeriesManageQuery$data,
    SeriesSortColumn,
} from "./__generated__/SeriesManageQuery.graphql";
import { keyOfId } from "../../../util";
import { ThumbnailStack } from "../../../ui/Series";


const PATH = "/~manage/series" as const;

export const ManageSeriesRoute = makeRoute({
    url: PATH,
    match: url => {
        if (url.pathname !== PATH) {
            return null;
        }

        const vars = queryParamsToSeriesVars(url.searchParams);
        const queryRef = loadQuery<SeriesManageQuery>(query, vars);

        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={() => <ManageNav active={PATH} />}
                render={data => !data.currentUser
                    ? <NotAuthorized />
                    : <ManageAssets
                        vars={vars}
                        connection={data.currentUser.mySeries}
                        titleKey="manage.my-series.title"
                    />
                }
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

const query = graphql`
    query SeriesManageQuery(
        $order: SeriesSortOrder!,
        $offset: Int!,
        $limit: Int!,
    ) {
        ...UserData
        currentUser {
            mySeries(order: $order, offset: $offset, limit: $limit) {
                __typename
                totalCount
                pageInfo {
                    hasNextPage hasPreviousPage
                    startIndex endIndex
                }
                items {
                    id
                    title
                    created
                    updated
                    tobiraDeletionTimestamp
                    syncedData { description }
                    entries {
                        __typename
                        ...on AuthorizedEvent {
                            isLive
                            syncedData { thumbnail audioOnly }
                        }
                    }
                }
            }
        }
    }
`;

export type SeriesConnection = NonNullable<SeriesManageQuery$data["currentUser"]>["mySeries"];
export type Series = SeriesConnection["items"];
export type SingleSeries = Series[number];

export const seriesColumns: ColumnProps[] = [
    {
        key: "EVENT_COUNT",
        label: "manage.my-series.content",
        headerWidth: 112,
        column: series => "entries" in series && <td css={{ fontSize: 14 }}>
            {i18n.t("manage.my-series.no-of-videos", { count: series.entries.length })}
        </td>,
    },
    {
        key: "UPDATED",
        label: "manage.asset-table.columns.updated",
        column: series => "updated" in series && <DateColumn date={series.updated ?? undefined} />,
    },
    {
        key: "CREATED",
        label: "manage.asset-table.columns.created",
        column: series => <DateColumn date={series.created ?? undefined} />,
    },
];


export const SeriesRow: React.FC<{ series: SingleSeries }> = ({ series }) => <TableRow
    itemType="series"
    item={{ ...series, description: series.syncedData?.description }}
    thumbnail={deletionIsPending => <SeriesThumbnail {...{ series, deletionIsPending }} />}
    link={`${PATH}/${keyOfId(series.id)}`}
    customColumns={seriesColumns.map(col => <Fragment key={col.key}>
        {col.column(series)}
    </Fragment>)}
/>;


const parseSeriesColumn = (sortBy: string | null): SeriesSortColumn =>
    sortBy !== null ? match<string, SeriesSortColumn>(sortBy, {
        "title": () => "TITLE",
        "created": () => "CREATED",
        "updated": () => "UPDATED",
        "event_count": () => "EVENT_COUNT",
    }) : "CREATED";

const queryParamsToSeriesVars = createQueryParamsParser<SeriesSortColumn>(parseSeriesColumn);

type SeriesThumbnailProps = {
    series: Pick<SingleSeries, "title" | "entries">;
    deletionIsPending?: boolean;
}

export const SeriesThumbnail: React.FC<SeriesThumbnailProps> = ({ series, deletionIsPending }) => {
    // Seems odd, but simply checking `e => e.__typename === "AuthorizedEvent"` will produce
    // TS2339 errors when compiling.
    type Entry = SingleSeries["entries"][number];
    type AuthorizedEvent = Extract<Entry, { __typename: "AuthorizedEvent" }>;
    const isAuthorizedEvent = (e: Entry): e is AuthorizedEvent =>
        e.__typename === "AuthorizedEvent";

    const thumbnails = series.entries
        .filter(isAuthorizedEvent)
        .map(e => ({
            isLive: e.isLive,
            audioOnly: e.syncedData ? e.syncedData.audioOnly : false,
            thumbnail: e.syncedData?.thumbnail,
        }));

    return <div css={{ "> div": { width: "100%" } }}>
        <ThumbnailStack title={series.title} {...{ thumbnails, deletionIsPending }} />
    </div>;
};
