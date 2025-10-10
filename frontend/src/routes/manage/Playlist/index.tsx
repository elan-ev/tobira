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
    TableRow,
} from "../Shared/Table";

import { keyOfId } from "../../../util";
import {
    PlaylistsManageQuery,
    PlaylistsManageQuery$data,
    PlaylistsSortColumn,
} from "./__generated__/PlaylistsManageQuery.graphql";
import { PlaylistThumbnail } from "./Shared";


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
                        additionalColumns={playlistColumns}
                        RenderRow={PlaylistRow}
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
                }
            }
        }
    }
`;


export type PlaylistConnection
    = NonNullable<PlaylistsManageQuery$data["currentUser"]>["myPlaylists"];
export type Playlists = PlaylistConnection["items"];
export type SinglePlaylist = Playlists[number];

const playlistColumns: ColumnProps<SinglePlaylist>[] = [
    {
        key: "EVENT_COUNT",
        label: "video.plural",
        headerWidth: 112,
        column: ({ item }) => <td css={{ fontSize: 14 }}>
            {i18n.t("manage.video-list.no-of-videos", { count: item.numEntries })}
        </td>,
    },
    {
        key: "UPDATED",
        label: "manage.table.columns.updated",
        column: ({ item }) => <DateColumn date={item.updated} />,
    },
];


const PlaylistRow: React.FC<{ item: SinglePlaylist }> = ({ item }) => <TableRow
    itemType="playlist"
    item={{ ...item, state: "READY" }}
    thumbnail={_ => <PlaylistThumbnail playlist={item} />}
    link={`${PATH}/${keyOfId(item.id)}`}
    customColumns={playlistColumns.map(col => <col.column key={col.key} item={item} />)}
/>;


const parsePlaylistColumn = (sortBy: string | null): PlaylistsSortColumn =>
    sortBy !== null
        ? match(sortBy, {
            "title": () => "TITLE" as const,
            "updated": () => "UPDATED" as const,
            "event_count": () => "EVENT_COUNT" as const,
        }) ?? "UPDATED"
        : "UPDATED";

const queryParamsToPlaylistsVars
    = createQueryParamsParser<PlaylistsSortColumn>(parsePlaylistColumn);
