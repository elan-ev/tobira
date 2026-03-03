import { graphql } from "react-relay";
import { match } from "@opencast/appkit";
import { LuCirclePlus } from "react-icons/lu";

import { ManageNav } from "..";
import { RootLoader } from "../../../layout/Root";
import { makeRoute } from "../../../rauta";
import { loadQuery } from "../../../relay";
import { NotAuthorized } from "../../../ui/error";
import { CreateButton, createQueryParamsParser, ListItem, ManageItems } from "../Shared/Table";
import { keyOfId } from "../../../util";
import {
    PlaylistsManageQuery,
    PlaylistsManageQuery$data,
    PlaylistsSortColumn,
} from "./__generated__/PlaylistsManageQuery.graphql";
import { PlaylistThumbnail } from "./Shared";
import { CreatePlaylistRoute } from "./Create";
import { EntryCount, Timestamp } from "../../../ui/metadata";
import { VideoListShareButton } from "../../../ui/Blocks/VideoList";
import { DirectPlaylistRoute } from "../../Playlist";
import { COLORS } from "../../../color";
import { ActualLinkButton } from "../Video";


export const PATH = "/~manage/playlists" as const;

export const ManagePlaylistsRoute = makeRoute({
    url: PATH,
    match: url => {
        if (url.pathname !== PATH) {
            return null;
        }

        const vars = queryParamsToPlaylistsVars(url.searchParams);
        const titleFilter = vars.filters?.title ?? null;
        const queryVars = {
            ...vars,
            // Todo: Adjust when more filter options are added
            filter: titleFilter ? { title: titleFilter } : null,
        };
        const queryRef = loadQuery<PlaylistsManageQuery>(query, queryVars);

        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={() => <ManageNav active={PATH} />}
                render={data => !data.currentUser
                    ? <NotAuthorized />
                    : <ManageItems
                        vars={vars}
                        connection={data.currentUser.myPlaylists}
                        titleKey="manage.playlist.table.title"
                        additionalSortOptions={[
                            { key: "ENTRY_COUNT", label: "manage.video-list.entries" },
                            { key: "UPDATED", label: "manage.table.sorting.updated" },
                        ]}
                        RenderItem={PlaylistItem}
                        createButton={<CreateLink />}
                    />
                }
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

const query = graphql`
    query PlaylistsManageQuery(
        $order: PlaylistsSortOrder!,
        $offset: Int!,
        $limit: Int!,
        $filter: SearchFilter,
    ) {
        ...UserData
        currentUser {
            myPlaylists(order: $order, offset: $offset, limit: $limit, filter: $filter) {
                __typename
                totalCount
                pageInfo { hasNextPage hasPrevPage }
                items {
                    id
                    title
                    updated
                    description
                    numEntries
                    thumbnailStack { thumbnails { url live audioOnly state }}
                    hostRealms { id }
                }
            }
        }
    }
`;

const CreateLink: React.FC = () => <CreateButton
    condition="canCreatePlaylists"
    path={CreatePlaylistRoute.url}
    text="manage.playlist.table.create"
    Icon={LuCirclePlus}
/>;


export type PlaylistConnection
    = NonNullable<PlaylistsManageQuery$data["currentUser"]>["myPlaylists"];
export type Playlists = PlaylistConnection["items"];
export type SinglePlaylist = Playlists[number];


const PlaylistItem: React.FC<{ item: SinglePlaylist }> = ({ item }) => <ListItem
    itemType="playlist"
    item={{ ...item, state: "READY" }}
    link={`${PATH}/${keyOfId(item.id)}`}
    thumbnail={_ => <PlaylistThumbnail playlist={item} />}
    metadata={[
        <EntryCount key={"entry count"} count={item.numEntries} />,
        <Timestamp
            key="timestamp"
            timestamp={item.updated ?? undefined}
        />,
    ]}
    shareButton={<VideoListShareButton
        kind="playlist"
        shareUrl={new URL(DirectPlaylistRoute.url({ playlistId: item.id }), document.baseURI).href}
        rssUrl={`/~rss/series/${keyOfId(item.id)}`}
        hideLabel
        css={{
            background: "transparent",
            padding: 4,
            "&&, &&:hover, &&:focus-visible": { border: 0 },
            "&&:hover": {
                backgroundColor: COLORS.neutral20,
            },
            fontSize: 14,
            "+ div": {
                borderRadius: 12,
                "> div": {
                    button: { opacity: 1 },
                    height: 165,
                    width: 300,
                    "> div + div": {
                        gap: 8,
                        padding: 12,
                        "input, button": {
                            fontSize: 14,
                        },
                    },
                },
            },
        }}
    />}
    linkButton={<ActualLinkButton
        to={new URL(DirectPlaylistRoute.url({ playlistId: item.id }), document.baseURI).href}
    />}
/>;


const parsePlaylistColumn = (sortBy: string | null): PlaylistsSortColumn =>
    sortBy !== null
        ? match(sortBy, {
            "title": () => "TITLE" as const,
            "updated": () => "UPDATED" as const,
            "entry_count": () => "ENTRY_COUNT" as const,
        }) ?? "UPDATED"
        : "UPDATED";

const queryParamsToPlaylistsVars
    = createQueryParamsParser<PlaylistsSortColumn>(parsePlaylistColumn);
