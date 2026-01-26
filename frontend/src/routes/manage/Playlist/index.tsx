import { graphql } from "react-relay";
import { match } from "@opencast/appkit";

import i18n from "../../../i18n";
import { ManageNav } from "..";
import { RootLoader } from "../../../layout/Root";
import { makeRoute } from "../../../rauta";
import { loadQuery } from "../../../relay";
import { NotAuthorized } from "../../../ui/error";
import { createQueryParamsParser, ListItem, ManageItems } from "../Shared/Table";

import { keyOfId } from "../../../util";
import {
    PlaylistsManageQuery,
    PlaylistsManageQuery$data,
    PlaylistsSortColumn,
} from "./__generated__/PlaylistsManageQuery.graphql";
import { PlaylistThumbnail } from "./Shared";
import { useTranslation } from "react-i18next";
import { isRealUser, useUser } from "../../../User";
import { LinkButton } from "../../../ui/LinkButton";
import { LuCalendar, LuCirclePlus, LuFilm } from "react-icons/lu";
import { CREATE_PLAYLIST_PATH } from "./Create";
import { COLORS } from "../../../color";
import { PrettyDate } from "../../../ui/time";


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
                    >
                        <CreatePlaylistLink />
                    </ManageItems>
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

const CreatePlaylistLink: React.FC = () => {
    const { t } = useTranslation();
    const user = useUser();

    return (!isRealUser(user) || !user.canCreatePlaylists)
        ? null
        : <LinkButton to={CREATE_PLAYLIST_PATH} css={{ width: "fit-content" }}>
            {t("manage.playlist.table.create")}
            <LuCirclePlus />
        </LinkButton>;
};



export type PlaylistConnection
    = NonNullable<PlaylistsManageQuery$data["currentUser"]>["myPlaylists"];
export type Playlists = PlaylistConnection["items"];
export type SinglePlaylist = Playlists[number];


const PlaylistItem: React.FC<{ item: SinglePlaylist }> = ({ item }) => <ListItem
    itemType="playlist"
    item={{ ...item, state: "READY" }}
    link={`${PATH}/${keyOfId(item.id)}`}
    thumbnail={_ => <PlaylistThumbnail playlist={item} />}
    dateAndAdditionalInfo={<DateAndCount
        timestamp={item.updated ?? undefined}
        count={item.numEntries}
    />}
/>;

type DateAndCountProps = {
    timestamp?: string;
    count: number;
    className?: string;
};

const DateAndCount: React.FC<DateAndCountProps> = ({
    timestamp, count, className,
}) => (
    <div {...{ className }} css={{
        display: "inline-flex",
        color: COLORS.neutral80,
        fontSize: 12,
        gap: 24,
        whiteSpace: "nowrap",
    }}>
        {timestamp && <div css={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LuCalendar css={{ fontSize: 15, color: COLORS.neutral60 }} />
            <PrettyDate date={new Date(timestamp)} />
        </div>}
        <div css={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
        }}>
            <LuFilm css={{ fontSize: 15, color: COLORS.neutral60, flexShrink: 0 }} />
            {i18n.t("manage.video-list.no-of-videos", { count })}
        </div>
    </div>
);


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
