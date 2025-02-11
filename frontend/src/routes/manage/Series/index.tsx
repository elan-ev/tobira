import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { LuPlusCircle } from "react-icons/lu";
import { graphql } from "react-relay";
import { match } from "@opencast/appkit";

import i18n from "../../../i18n";
import { ManageNav } from "..";
import { RootLoader } from "../../../layout/Root";
import { makeRoute } from "../../../rauta";
import { loadQuery } from "../../../relay";
import { NotAuthorized } from "../../../ui/error";
import {
    ColumnProps,
    createQueryParamsParser,
    DateColumn,
    ManageItems,
    SharedManageProps,
    TableRow,
} from "../Shared/Table";
import {
    SeriesManageQuery,
    SeriesManageQuery$data,
    SeriesSortColumn,
} from "./__generated__/SeriesManageQuery.graphql";
import { isSynced, keyOfId } from "../../../util";
import { ThumbnailStack } from "../../../ui/Series";
import { CREATE_SERIES_PATH } from "./Create";
import { LinkButton } from "../../../ui/LinkButton";


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
                    : <ManageSeries connection={data.currentUser.mySeries} vars={vars} />
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

const ManageSeries: React.FC<SharedManageProps> = ({ vars, connection }) => {
    const { t } = useTranslation();

    return (
        <ManageItems
            titleKey="manage.my-series.title"
            additionalColumns={seriesColumns}
            {...{ vars, connection }}
        >
            <div css={{ display: "flex" }}>
                <LinkButton to={CREATE_SERIES_PATH}>
                    {t("manage.my-series.create.title")}
                    <LuPlusCircle />
                </LinkButton>
            </div>
        </ManageItems>
    );
};


export type SeriesConnection = NonNullable<SeriesManageQuery$data["currentUser"]>["mySeries"];
export type Series = SeriesConnection["items"];
export type SingleSeries = Series[number];
export type Entry = SingleSeries["entries"][number];

export const seriesColumns: ColumnProps[] = [
    {
        key: "EVENT_COUNT",
        label: "manage.my-series.content",
        headerWidth: 112,
        column: series => <td css={{ fontSize: 14 }}>
            {i18n.t("manage.my-series.no-of-videos", { count: series.entries?.length })}
        </td>,
    },
    {
        key: "UPDATED",
        label: "manage.item-table.columns.updated",
        column: series => <DateColumn date={series.updated} />,
    },
    {
        key: "CREATED",
        label: "manage.item-table.columns.created",
        column: series => <DateColumn date={series.created} />,
    },
];


export const SeriesRow: React.FC<{ series: SingleSeries }> = ({ series }) => {
    const seriesItem = {
        ...series,
        description: series.syncedData?.description,
        isSynced: isSynced(series),
    };
    return <TableRow
        itemType="series"
        item={seriesItem}
        thumbnail={deletionIsPending => <SeriesThumbnail {...{ series, deletionIsPending }} />}
        link={`${PATH}/${keyOfId(series.id)}`}
        customColumns={seriesColumns.map(col => <Fragment key={col.key}>
            {col.column(seriesItem)}
        </Fragment>)}
    />;
};


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
