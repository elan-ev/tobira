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
    descriptionStyle,
    ManageItems,
    TableRow,
    thumbnailLinkStyle,
    titleLinkStyle,
} from "../Shared/Table";
import {
    SeriesManageQuery,
    SeriesManageQuery$data,
    SeriesSortColumn,
} from "./__generated__/SeriesManageQuery.graphql";
import { Link } from "../../../router";
import { ThumbnailStack } from "../../Search";
import { DirectSeriesRoute } from "../../Series";
import { SmallDescription } from "../../../ui/metadata";


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
                    : <ManageItems
                        vars={vars}
                        connection={data.currentUser.mySeries}
                        titleKey="manage.my-series.title"
                        additionalColumns={seriesColumns}
                        RenderRow={SeriesRow}
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
                pageInfo { hasNextPage hasPrevPage }
                items {
                    id
                    title
                    created
                    updated
                    syncedData { description }
                    numVideos
                    thumbnailStack { thumbnails { url live audioOnly }}
                }
            }
        }
    }
`;

export type SeriesConnection = NonNullable<SeriesManageQuery$data["currentUser"]>["mySeries"];
export type Series = SeriesConnection["items"];
export type SingleSeries = Series[number];

export const seriesColumns: ColumnProps<SingleSeries>[] = [
    {
        key: "EVENT_COUNT",
        label: "manage.my-series.content",
        headerWidth: 112,
        column: ({ item }) => <td css={{ fontSize: 14 }}>
            {i18n.t("manage.my-series.no-of-videos", { count: item.numVideos })}
        </td>,
    },
    {
        key: "UPDATED",
        label: "manage.item-table.columns.updated",
        column: ({ item }) => <DateColumn date={item.updated} />,
    },
    {
        key: "CREATED",
        label: "manage.item-table.columns.created",
        column: ({ item }) => <DateColumn date={item.created} />,
    },
];


export const SeriesRow: React.FC<{ item: SingleSeries }> = ({ item }) => {
    // Todo: change to "series details" route when available
    const link = DirectSeriesRoute.url({ seriesId: item.id });

    return (
        <TableRow
            thumbnail={<Link to={link} css={{ ...thumbnailLinkStyle }}>
                <span css={{ "> div": { width: "100%" } }}>
                    <ThumbnailStack title={item.title} thumbnailStack={item.thumbnailStack} />
                </span>
            </Link>}
            title={<Link to={link} css={{ ...titleLinkStyle }}>{item.title}</Link>}
            description={item.syncedData && <SmallDescription
                css={{ ...descriptionStyle }}
                text={item.syncedData.description}
            />}
            syncInfo={{
                isSynced: !!item.syncedData,
                notReadyLabel: "series.not-ready.label",
            }}
            customColumns={seriesColumns.map(col => <col.column key={col.key} item={item} />)}
        />
    );
};

const parseSeriesColumn = (sortBy: string | null): SeriesSortColumn =>
    sortBy !== null
        ? match<string, SeriesSortColumn>(sortBy, {
            "title": () => "TITLE",
            "created": () => "CREATED",
            "updated": () => "UPDATED",
            "event_count": () => "EVENT_COUNT",
        }, () => "CREATED")
        : "CREATED";

const queryParamsToSeriesVars = createQueryParamsParser<SeriesSortColumn>(parseSeriesColumn);
