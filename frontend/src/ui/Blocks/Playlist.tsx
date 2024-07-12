import { graphql, readInlineData, useFragment } from "react-relay";
import { Fields } from "../../relay";
import { useTranslation } from "react-i18next";
import {
    PlaylistBlockData$data,
    PlaylistBlockData$key,
} from "./__generated__/PlaylistBlockData.graphql";
import { VideoListEventData$key } from "./__generated__/VideoListEventData.graphql";
import { VideoListBlock, VideoListBlockContainer, videoListEventFragment } from "./VideoList";
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
}

export const PlaylistBlockFromBlock: React.FC<FromBlockProps> = ({ fragRef, ...rest }) => {
    const { t } = useTranslation();
    const { playlist, ...block } = useFragment(blockFragment, fragRef);
    return playlist == null
        ? <Card kind="error">{t("playlist.deleted-playlist-block")}</Card>
        : <PlaylistBlockFromPlaylist fragRef={playlist} {...rest} {...block} />;
};

type BlockProps = Partial<Omit<Fields<PlaylistBlockData$data>, "playlist">>;

type SharedFromPlaylistProps = SharedProps & BlockProps & {
    title?: string;
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

    const items = playlist.entries.map(entry => {
        if (entry.__typename === "AuthorizedEvent") {
            const out = readInlineData<VideoListEventData$key>(videoListEventFragment, entry);
            return out;
        } else if (entry.__typename === "Missing") {
            return "missing";
        } else if (entry.__typename === "NotAllowed") {
            return "unauthorized";
        } else {
            return unreachable();
        }
    });

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
        {...{ title, items }}
        description={(props.showMetadata && playlist.description) || undefined}
        basePath={props.basePath}
        items={items}
        isPlaylist
        listId={playlist.id}
    />;
};
