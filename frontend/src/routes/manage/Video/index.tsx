import { graphql } from "react-relay";
import { match } from "@opencast/appkit";

import { ManageNav } from "..";
import { RootLoader } from "../../../layout/Root";
import {
    VideoManageQuery,
    VideoManageQuery$data,
    VideosSortColumn,
} from "./__generated__/VideoManageQuery.graphql";
import { makeRoute } from "../../../rauta";
import { loadQuery } from "../../../relay";
import { NotAuthorized } from "../../../ui/error";
import { Thumbnail } from "../../../ui/Video";
import { keyOfId } from "../../../util";
import {
    ColumnProps,
    createQueryParamsParser,
    DateColumn,
    ManageItems,
    TableRow,
} from "../Shared/Table";
import { useTranslation } from "react-i18next";
import { ellipsisOverflowCss } from "../../../ui";
import { Link } from "../../../router";
import { DirectSeriesRoute } from "../../Series";
import { COLORS } from "../../../color";


const PATH = "/~manage/videos" as const;

export const ManageVideosRoute = makeRoute({
    url: PATH,
    match: url => {
        if (url.pathname !== PATH) {
            return null;
        }

        const vars = queryParamsToVideosVars(url.searchParams);
        const titleFilter = vars.filters?.title ?? null;
        const queryVars = {
            ...vars,
            // Todo: Adjust when more filter options are added
            filter: titleFilter ? { title: titleFilter } : null,
        };
        const queryRef = loadQuery<VideoManageQuery>(query, queryVars);

        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={() => <ManageNav active={PATH} />}
                render={data => !data.currentUser
                    ? <NotAuthorized />
                    : <ManageItems
                        vars={vars}
                        connection={data.currentUser.myVideos}
                        titleKey="manage.video.table"
                        additionalColumns={videoColumns}
                        RenderRow={EventRow}
                    />
                }
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

const query = graphql`
    query VideoManageQuery(
        $order: VideosSortOrder!,
        $offset: Int!,
        $limit: Int!,
        $filter: SearchFilter,
    ) {
        ...UserData
        currentUser {
            myVideos(order: $order, offset: $offset, limit: $limit, filter: $filter) {
                __typename
                totalCount
                pageInfo { hasNextPage hasPrevPage }
                items {
                    id
                    title
                    created
                    description
                    isLive
                    tobiraDeletionTimestamp
                    series { id title }
                    syncedData {
                        duration
                        thumbnail
                        updated
                        startTime
                        endTime
                        audioOnly
                    }
                    authorizedData {
                        tracks { resolution }
                    }
                }
            }
        }
    }
`;

export type EventConnection = NonNullable<VideoManageQuery$data["currentUser"]>["myVideos"];
export type Events = EventConnection["items"];
export type Event = Events[number];

// Todo: add series column
const videoColumns: ColumnProps<Event>[] = [
    {
        key: "SERIES",
        label: "series.singular",
        headerWidth: 175,
        column: ({ item }) => <SeriesColumn
            title={item.series?.title}
            seriesId={item.series?.id}
        />,
    },
    {
        key: "UPDATED",
        label: "manage.table.columns.updated",
        column: ({ item }) => <DateColumn date={item.syncedData?.updated} />,
    },
    {
        key: "CREATED",
        label: "manage.table.columns.created",
        column: ({ item }) => <DateColumn date={item.created} />,
    },
];

type SeriesColumnProps = {
    seriesId?: string;
    title?: string;
};

const SeriesColumn: React.FC<SeriesColumnProps> = ({ title, seriesId }) => {
    const { t } = useTranslation();

    const titleLink = seriesId
        ? <Link to={DirectSeriesRoute.url({ seriesId })} css={{ textDecoration: "none" }}>
            {title && title.trim().length > 0 ? title : <i>
                {t("manage.table.no-series-title")}
            </i>}
        </Link>
        : <i css={{ color: COLORS.neutral60 }}>{t("general.none")}</i>;

    return (
        <td css={{
            "&&": { display: "block" },
            fontSize: 14,
            ...ellipsisOverflowCss(3),
        }}>{titleLink}</td>
    );
};

const EventRow: React.FC<{ item: Event }> = ({ item }) => <TableRow
    itemType="video"
    item={item}
    link={`${PATH}/${keyOfId(item.id)}`}
    thumbnail={status => <Thumbnail event={item} {...{ status }} />}
    customColumns={videoColumns.map(col => <col.column key={col.key} item={item} />)}
/>;


const parseVideosColumn = (sortBy: string | null): VideosSortColumn =>
    sortBy !== null
        ? match(sortBy, {
            "title": () => "TITLE" as const,
            "created": () => "CREATED" as const,
            "updated": () => "UPDATED" as const,
            "series": () => "SERIES" as const,
        }) ?? "CREATED"
        : "CREATED";

const queryParamsToVideosVars = createQueryParamsParser<VideosSortColumn>(parseVideosColumn);
