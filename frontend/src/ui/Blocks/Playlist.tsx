import { graphql, useFragment } from "react-relay";
import { Fields } from "../../relay";
import { useTranslation } from "react-i18next";
import {
    PlaylistBlockData$data,
    PlaylistBlockData$key,
} from "./__generated__/PlaylistBlockData.graphql";
import { VideoListBlock, VideoListBlockContainer } from "./VideoList";
import {
    PlaylistBlockPlaylistData$data,
    PlaylistBlockPlaylistData$key,
} from "./__generated__/PlaylistBlockPlaylistData.graphql";
import { Card, unreachable } from "@opencast/appkit";


type SharedProps = {
    basePath: string;
    moreOfTitle?: boolean;
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
    edit?: boolean;
}

export const PlaylistBlockFromBlock: React.FC<FromBlockProps> = ({ fragRef, ...rest }) => {
    const { t } = useTranslation();
    const { playlist, ...block } = useFragment(blockFragment, fragRef);
    return playlist == null && rest.edit
        ? <Card kind="error">{t("playlist.deleted-playlist-block")}</Card>
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
            {t("playlist.deleted-playlist-block")}
        </VideoListBlockContainer>;
    }

    if (playlist.__typename === "NotAllowed") {
        return <VideoListBlockContainer showViewOptions={false}>
            {t("playlist.not-allowed-playlist-block")}
        </VideoListBlockContainer>;
    }
    if (playlist.__typename !== "AuthorizedPlaylist") {
        return unreachable();
    }

    const title = props.showTitle
        ? (props.moreOfTitle ? t("video.more-from-playlist", { playlist: playlist.title })
            : playlist.title)
        : undefined;

    return <VideoListBlock
        initialLayout={props.layout}
        initialOrder={
            (props.order === "%future added value" ? undefined : props.order) ?? "ORIGINAL"
        }
        allowOriginalOrder
        {...{ title }}
        description={(props.showMetadata && playlist.description) || undefined}
        activeEventId={props.activeEventId}
        basePath={props.basePath}
        isPlaylist
        listId={playlist.id}
        listEntries={playlist.entries}
    />;
};
