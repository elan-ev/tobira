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
import { createQueryParamsParser, ManageItems, ListItem } from "../Shared/Table";
import { PartOfSeriesLink } from "../../../ui/Blocks/VideoList";
import { DateAndCreators } from "../../../ui/metadata";


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
                        additionalSortOptions={[
                            { key: "SERIES", label: "series.singular" },
                            { key: "CREATED", label: "manage.table.sorting.created" },
                            { key: "UPDATED", label: "manage.table.sorting.updated" },
                        ]}
                        RenderItem={VideoItem}
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
                    creators
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


const VideoItem: React.FC<{ item: Event }> = ({ item }) => <ListItem
    itemType="video"
    item={item}
    link={`${PATH}/${keyOfId(item.id)}`}
    thumbnail={state => <Thumbnail event={item} {...{ state }} />}
    created={item.created}
    dateAndAdditionalInfo={
        <DateAndCreators
            timestamp={item.syncedData?.startTime ?? item.created}
            isLive={item.isLive}
            creators={[...item.creators]}
        />
    }
    partOf={item.series && <PartOfSeriesLink
        css={{
            fontSize: 11,
            gap: 6,
            svg: { fontSize: 15 },
        }}
        seriesTitle={item.series.title}
        seriesId={item.series.id}
    />}
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
