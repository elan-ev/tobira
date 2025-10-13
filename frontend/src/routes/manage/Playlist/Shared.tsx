import { useTranslation } from "react-i18next";
import { LuEye, LuPenLine, LuShieldCheck } from "react-icons/lu";
import { graphql } from "react-relay";
import { unreachable } from "@opencast/appkit";

import { ManagePlaylistsRoute, SinglePlaylist } from ".";
import { ThumbnailStack } from "../../../ui/ThumbnailStack";
import { makeRoute, Route } from "../../../rauta";
import { ManageNav, ReturnLink, SharedManageNavProps } from "../Shared/Nav";
import { RootLoader } from "../../../layout/Root";
import { loadQuery } from "../../../relay";
import { keyOfId, playlistId } from "../../../util";
import { b64regex } from "../../util";
import { NotFound } from "../../NotFound";
import { NotAuthorized } from "../../../ui/error";
import CONFIG from "../../../config";
import { DirectPlaylistRoute } from "../../Playlist";
import { COLORS } from "../../../color";
import { SharedPlaylistManageQuery } from "./__generated__/SharedPlaylistManageQuery.graphql";



export type QueryResponse = SharedPlaylistManageQuery["response"];
export type Playlist = QueryResponse["playlist"];
export type AuthorizedPlaylist = Extract<Playlist, { __typename: "AuthorizedPlaylist" }>;

type ManagePlaylistPageType = "details" | "acl";

/** Helper around `makeRoute` for manage single playlist subpages. */
export const makeManagePlaylistRoute = (
    page: ManagePlaylistPageType,
    path: `/${string}` | "",
    render: (playlist: AuthorizedPlaylist, data: QueryResponse) => JSX.Element,
): Route & { url: (args: { id: string }) => string } => (
    makeRoute({
        url: ({ id }: { id: string }) => `/~manage/playlists/${keyOfId(id)}${path}`,
        match: url => {
            const regex = new RegExp(`^/~manage/playlists/(${b64regex}+)${path}/?$`, "u");
            const params = regex.exec(url.pathname);
            if (params === null) {
                return null;
            }

            const id = decodeURIComponent(params[1]);
            const queryRef = loadQuery<SharedPlaylistManageQuery>(query, {
                id: playlistId(id),
            });

            return {
                render: () => <RootLoader
                    {...{ query, queryRef }}
                    noindex
                    nav={data => [
                        <ReturnLink
                            key={1}
                            url={ManagePlaylistsRoute.url}
                            title="manage.playlist.table.title"
                        />,
                        <ManagePlaylistNav key={2} playlist={data.playlist} active={page} />,
                    ]}
                    render={data => {
                        if (data.playlist == null) {
                            return <NotFound kind="playlist" />;
                        }
                        if (data.playlist.__typename !== "AuthorizedPlaylist"
                            || !data.playlist.canWrite
                        ) {
                            return <NotAuthorized />;
                        }

                        return render(data.playlist, data);
                    }}
                />,
                dispose: () => queryRef.dispose(),
            };
        },
    })
);


const query = graphql`
    query SharedPlaylistManageQuery($id: ID!) {
        ...UserData
        ...AccessKnownRolesData
        playlist: playlistById(id: $id) {
            __typename
            ... on AuthorizedPlaylist {
                id
                title
                description
                canWrite
                thumbnailStack { thumbnails { url live audioOnly state }}
                entries {
                    __typename
                    ...on AuthorizedEvent {
                        id
                        title
                        isLive
                        syncedData {
                            thumbnail
                            audioOnly
                        }
                    }
                }
                hostRealms { id isMainRoot name path }
            }
        }
    }
`;


type ManagePlaylistNavProps = SharedManageNavProps & {
    playlist: Playlist;
};

const ManagePlaylistNav: React.FC<ManagePlaylistNavProps> = ({ playlist, active }) => {
    const { t } = useTranslation();

    if (playlist == null) {
        return null;
    }

    if (playlist.__typename !== "AuthorizedPlaylist") {
        return unreachable();
    }

    const id = keyOfId(playlist.id);

    const navEntries = [
        {
            url: `/~manage/playlists/${id}`,
            page: "details",
            body: <><LuPenLine />{t("manage.playlist.details.title")}</>,
        },
    ];

    if (CONFIG.allowAclEdit) {
        navEntries.splice(1, 0, {
            url: `/~manage/playlists/${id}/access`,
            page: "acl",
            body: <><LuShieldCheck />{t("acl.title")}</>,
        });
    }

    const link = DirectPlaylistRoute.url({ playlistId: id });
    const title = playlist.title;
    const ariaLabel = t("playlist.playlist-page", { playlist: playlist.title });

    const additionalStyles = {
        padding: 8,
        borderBottom: `2px solid ${COLORS.neutral05}`,
    };

    const thumbnail = <>
        <LuEye />
        <PlaylistThumbnail {...{ playlist }} />
    </>;

    return <ManageNav {...{
        active,
        link,
        ariaLabel,
        title,
        thumbnail,
        navEntries,
        additionalStyles,
    }} />;
};


export const PlaylistThumbnail: React.FC<{
    playlist: Pick<SinglePlaylist, "title" | "thumbnailStack">
}> = ({ playlist }) => <div css={{ position: "relative", "> div": { width: "100%" } }}>
    <ThumbnailStack
        thumbnails={playlist.thumbnailStack.thumbnails}
        title={playlist.title}
    />
</div>;
