import { graphql } from "react-relay";
import { match, screenWidthAtMost } from "@opencast/appkit";
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
import { COLORS } from "../../../color";
import { BREAKPOINT_SMALL } from "../../../GlobalStyle";
import { LinkButton } from "../../../ui/LinkButton";


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
        <div key="access-date-series" css={{
            display: "flex",
            alignItems: "center",
            minWidth: 0,
            gap: 18,
            [screenWidthAtMost(BREAKPOINT_SMALL)]: {
                columnGap: 12,
            },
        }}>
            <AccessIcon {...{ item }} />
            <Timestamp
                timestamp={item.syncedData?.startTime ?? item.created}
                isLive={item.isLive}
            />
            {item.series && <PartOfSeriesLink
                css={{
                    fontSize: 12,
                    gap: 6,
                    svg: { fontSize: 15 },
                    paddingTop: "unset",
                    minWidth: 0,
                }}
                seriesTitle={item.series.title}
                seriesId={item.series.id}
            />}
        </div>,
        <Creators key="creators" creators={[...item.creators]} css={{
            minWidth: 0,
            fontSize: 12,
            svg: { fontSize: 15 },
            ul: {
                display: "inline-block",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
            },
            li: { display: "inline" },
            gap: 6,
        }} />,
    ]}
    shareButton={
        <VideoShareButton
            event={item}
            videoLink={new URL(DirectVideoRoute.url({ videoId: item.id }), document.baseURI).href}
            hideLabel
            noTimestamp
        />}
    linkButton={<ItemLinkButton to={
        new URL(DirectVideoRoute.url({ videoId: item.id }), document.baseURI).href
    }/>}
/>;

export const ItemLinkButton: React.FC<{ to: string }> = ({ to }) => (
    <LinkButton
        to={to}
        extraCss={{
            "&&": {
                border: 0,
                background: "transparent",
                padding: 4,
                height: "unset",
                position: "relative",
                borderRadius: 8,
                ":hover": {
                    backgroundColor: COLORS.neutral20,
                    border: 0,
                },
            },
        }}
    >
        <LuCornerUpRight size={18} />
    </LinkButton>
);


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
