import { graphql } from "react-relay";
import { match, ProtoButton } from "@opencast/appkit";
import { LuCornerUpRight, LuUpload } from "react-icons/lu";

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
import { Creators, Thumbnail } from "../../../ui/Video";
import { AccessIcon, keyOfId } from "../../../util";
import {
    createQueryParamsParser, ManageItems, ListItem,
    CreateButton, buildSearchFilter,
} from "../Shared/Table";
import { PartOfSeriesLink } from "../../../ui/Blocks/VideoList";
import { Timestamp } from "../../../ui/metadata";
import { UploadRoute } from "../../Upload";
import { DirectVideoRoute, VideoShareButton } from "../../Video";
import { useRouter } from "../../../router";
import { COLORS } from "../../../color";
import { focusStyle } from "../../../ui";


const PATH = "/~manage/videos" as const;

export const ManageVideosRoute = makeRoute({
    url: PATH,
    match: url => {
        if (url.pathname !== PATH) {
            return null;
        }

        const vars = queryParamsToVideosVars(url.searchParams);
        const queryVars = {
            ...vars,
            filter: buildSearchFilter(vars.filters),
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
                        withCreatorFilter
                        connection={data.currentUser.myVideos}
                        titleKey="manage.video.table"
                        additionalSortOptions={[
                            { key: "SERIES", label: "series.singular" },
                            { key: "CREATED", label: "manage.table.sorting.created" },
                            { key: "UPDATED", label: "manage.table.sorting.updated" },
                        ]}
                        RenderItem={VideoItem}
                        createButton={<UploadLink />}
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
                    series { id opencastId title }
                    readRoles
                    writeRoles
                    previewRoles
                    syncedData {
                        duration
                        thumbnail
                        updated
                        startTime
                        endTime
                        audioOnly
                    }
                    authorizedData {
                        tracks { uri flavor resolution }
                    }
                }
            }
        }
    }
`;

const UploadLink: React.FC = () => <CreateButton
    condition="canUpload"
    path={UploadRoute.url()}
    text="upload.title"
    Icon={LuUpload}
/>;


export type EventConnection = NonNullable<VideoManageQuery$data["currentUser"]>["myVideos"];
export type Events = EventConnection["items"];
export type Event = Events[number];


const VideoItem: React.FC<{ item: Event }> = ({ item }) => <ListItem
    itemType="video"
    item={item}
    link={`${PATH}/${keyOfId(item.id)}`}
    thumbnail={state => <Thumbnail event={item} {...{ state }} />}
    created={item.created}
    metadata={[
        <Creators key="creators" creators={[...item.creators]} css={{
            minWidth: 0,
            fontSize: 12,
            maxWidth: "100%",
            svg: { fontSize: 15 },
            ul: {
                display: "inline-block",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
            },
            li: { display: "inline" },
        }} />,
        <AccessIcon key="access-indicator" {...{ item }} />,
        <Timestamp
            key="timestamp"
            timestamp={item.syncedData?.startTime ?? item.created}
            isLive={item.isLive}
        />,
        item.series && <PartOfSeriesLink
            key="series"
            css={{
                fontSize: 11,
                gap: 6,
                svg: { fontSize: 15 },
                paddingTop: "unset",
            }}
            seriesTitle={item.series.title}
            seriesId={item.series.id}
        />,
    ]}
    shareButton={<VideoShareButton
        event={item}
        videoLink={new URL(DirectVideoRoute.url({ videoId: item.id }), document.baseURI).href}
        hideLabel
    />}
    linkButton={<ActualLinkButton
        to={new URL(DirectVideoRoute.url({ videoId: item.id }), document.baseURI).href}
    />}
/>;

export const ActualLinkButton: React.FC<{ to: string }> = ({ to }) => {
    const router = useRouter();

    return (
        <ProtoButton
            onClick={() => router.goto(to)}
            css={{
                position: "relative",
                zIndex: 5,
                ":hover": { backgroundColor: COLORS.neutral20 },
                borderRadius: 8,
                ...focusStyle({ offset: -1 }),
            }}
        >
            <LuCornerUpRight />
        </ProtoButton>
    );

};


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
