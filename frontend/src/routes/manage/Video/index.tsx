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


const PATH = "/~manage/videos" as const;

export const ManageVideosRoute = makeRoute({
    url: PATH,
    match: url => {
        if (url.pathname !== PATH) {
            return null;
        }

        const vars = queryParamsToVideosVars(url.searchParams);
        const queryRef = loadQuery<VideoManageQuery>(query, vars);

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
                        titleKey="manage.my-videos.title"
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
    ) {
        ...UserData
        currentUser {
            myVideos(order: $order, offset: $offset, limit: $limit) {
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
        label: "manage.item-table.columns.series",
        column: ({ item }) => <SeriesColumn title={item.series?.title} />,
    },
    {
        key: "UPDATED",
        label: "manage.item-table.columns.updated",
        column: ({ item }) => <DateColumn date={item.syncedData?.updated} />,
    },
    {
        key: "CREATED",
        label: "manage.item-table.columns.created",
        column: ({ item }) => <DateColumn date={item.created} />,
    },
];

const SeriesColumn: React.FC<{ title?: string }> = ({ title }) => {
    const { t } = useTranslation();

    return (
        <td css={{
            "&&": { display: "block" },
            fontSize: 14,
            ...ellipsisOverflowCss(3),
        }}>
            {title
                // Todo 1: consider making this a link to the series
                // Todo 2: improve backend sorting so that videos without series are also grouped
                ? <>{title}</>
                : <i>{t("manage.item-table.no-series")}</i>
            }
        </td>
    );
};

const EventRow: React.FC<{ item: Event }> = ({ item }) => <TableRow
    itemType="video"
    item={item}
    link={`${PATH}/${keyOfId(item.id)}`}
    thumbnail={deletionIsPending => <Thumbnail event={item} {...{ deletionIsPending }} />}
    customColumns={videoColumns.map(col => <col.column key={col.key} item={item} />)}
/>;


const parseVideosColumn = (sortBy: string | null): VideosSortColumn =>
    sortBy !== null
        ? match(sortBy, {
            "title": () => "TITLE" as const,
            "created": () => "CREATED" as const,
            "updated": () => "UPDATED" as const,
        }) ?? "CREATED"
        : "CREATED";

const queryParamsToVideosVars = createQueryParamsParser<VideosSortColumn>(parseVideosColumn);
