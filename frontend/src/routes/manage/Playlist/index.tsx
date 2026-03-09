import { graphql } from "react-relay";
import { match } from "@opencast/appkit";
import { LuCirclePlus } from "react-icons/lu";

import { ManageNav } from "..";
import { RootLoader } from "../../../layout/Root";
import { makeRoute } from "../../../rauta";
import { loadQuery } from "../../../relay";
import { NotAuthorized } from "../../../ui/error";
import { Creators } from "../../../ui/Video";
import {
    CreateButton, createQueryParamsParser, ListItem,
    ManageItems, buildSearchFilter,
} from "../Shared/Table";
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
import { ActualLinkButton } from "../Video";


export const PATH = "/~manage/playlists" as const;

export const ManagePlaylistsRoute = makeRoute({
    url: PATH,
    match: url => {
        if (url.pathname !== PATH) {
            return null;
        }

        const vars = queryParamsToPlaylistsVars(url.searchParams);
        const queryVars = {
            ...vars,
            filter: buildSearchFilter(vars.filters),
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
                        withCreatorFilter
                        vars={vars}
                        connection={data.currentUser.myPlaylists}
                        titleKey="manage.playlist.table.title"
                        additionalSortOptions={[
                            { key: "ENTRY_COUNT", label: "playlist.entry-count" },
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
                    creator
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
        <Creators key="creator" creators={[item.creator]} css={{
            fontSize: 12,
            gap: 6,
            svg: { fontSize: 15 },
        }} />,
        <EntryCount forPlaylist key={"entry count"} count={item.numEntries} />,
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
