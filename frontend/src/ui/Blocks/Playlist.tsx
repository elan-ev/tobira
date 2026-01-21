import { graphql, useFragment } from "react-relay";
import { Fields } from "../../relay";
import { useTranslation } from "react-i18next";
import { Card, unreachable } from "@opencast/appkit";

import {
    PlaylistBlockData$data,
    PlaylistBlockData$key,
} from "./__generated__/PlaylistBlockData.graphql";
import {
    PlaylistBlockPlaylistData$data,
    PlaylistBlockPlaylistData$key,
} from "./__generated__/PlaylistBlockPlaylistData.graphql";
import { ManagePlaylistDetailsRoute } from "../../routes/manage/Playlist/PlaylistDetails";
import { keyOfId } from "../../util";
import { VideoListBlock, VideoListBlockContainer } from "./VideoList";
import { DirectPlaylistRoute, PlaylistRoute } from "../../routes/Playlist";


type SharedProps = {
    realmPath: string | null;
    moreOfTitle?: boolean;
    editMode?: boolean;
};

const blockFragment = graphql`
    fragment PlaylistBlockData on PlaylistBlock {
        playlist { ...PlaylistBlockPlaylistData }
        showTitle
        showMetadata
        order
        layout
    }
`;

const playlistFragment = graphql`
    fragment PlaylistBlockPlaylistData on Playlist {
        __typename
        ... on NotAllowed { dummy } # workaround
        ... on AuthorizedPlaylist {
            id
            title
            description
            creator
            canWrite
            entries {
                __typename
                ... on AuthorizedEvent { id, ...VideoListEventData }
                ... on Missing { dummy }
                ... on NotAllowed { dummy }
            }
        }
    }
`;

type FromBlockProps = SharedProps & {
    fragRef: PlaylistBlockData$key;
}

export const PlaylistBlockFromBlock: React.FC<FromBlockProps> = ({ fragRef, ...rest }) => {
    const { t } = useTranslation();
    const { playlist, ...block } = useFragment(blockFragment, fragRef);
    return playlist == null && rest.editMode
        ? <Card kind="error">{t("playlist.deleted-block")}</Card>
        : playlist != null && <PlaylistBlockFromPlaylist fragRef={playlist} {...rest} {...block} />;
};

type BlockProps = Partial<Omit<Fields<PlaylistBlockData$data>, "playlist">>;

type SharedFromPlaylistProps = SharedProps & BlockProps & {
    title?: string;
    activeEventId?: string;
};

type FromPlaylistProps = SharedFromPlaylistProps & {
    fragRef: PlaylistBlockPlaylistData$key;
};

export const PlaylistBlockFromPlaylist: React.FC<FromPlaylistProps> = (
    { fragRef, ...rest },
) => {
    const playlist = useFragment(playlistFragment, fragRef);
    return <PlaylistBlock playlist={playlist} {...rest} />;
};

type Props = SharedFromPlaylistProps & {
    playlist: PlaylistBlockPlaylistData$data;
};

export const PlaylistBlock: React.FC<Props> = ({ playlist, ...props }) => {
    const { t } = useTranslation();

    if (!playlist) {
        return <VideoListBlockContainer showViewOptions={false}>
            {t("playlist.deleted-block")}
        </VideoListBlockContainer>;
    }

    if (playlist.__typename === "NotAllowed") {
        return <VideoListBlockContainer showViewOptions={false}>
            {t("playlist.not-allowed-block")}
        </VideoListBlockContainer>;
    }
    if (playlist.__typename !== "AuthorizedPlaylist") {
        return unreachable();
    }

    const title = props.showTitle
        ? (props.moreOfTitle ? t("video.more-from-playlist", { playlist: playlist.title })
            : playlist.title)
        : undefined;

    const playlistKey = keyOfId(playlist.id);

    return <VideoListBlock
        displayOptions={{
            initialLayout: props.layout,
            initialOrder: (props.order === "%future added value" ? undefined : props.order)
                ?? "ORIGINAL",
            allowOriginalOrder: true,
        }}
        metadata={{
            title,
            description: (props.showMetadata && playlist.description) || undefined,
            creators: props.showMetadata ? [playlist.creator] : undefined,
            canWrite: playlist.canWrite,
        }}
        activeEventId={props.activeEventId}
        realmPath={props.realmPath}
        listId={playlist.id}
        listEntries={playlist.entries}
        editMode={props.editMode ?? false}
        shareInfo={{
            kind: "playlist",
            shareUrl: props.realmPath == null
                ? DirectPlaylistRoute.url({ playlistId: playlist.id })
                : PlaylistRoute.url({ realmPath: props.realmPath, playlistId: playlist.id }),
            rssUrl: `/~rss/playlist/${playlistKey}`,
        }}
        linkToManagePage={ManagePlaylistDetailsRoute.url({ id: playlist.id })}
    />;
};
