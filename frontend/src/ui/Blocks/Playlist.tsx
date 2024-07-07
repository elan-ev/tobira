import { graphql, readInlineData, useFragment } from "react-relay";
import { PlaylistBlockData$key } from "./__generated__/PlaylistBlockData.graphql";
import { useTranslation } from "react-i18next";
import { VideoListEventData$key } from "./__generated__/VideoListEventData.graphql";
import { VideoListBlock, VideoListBlockContainer, videoListEventFragment } from "./VideoList";
import { unreachable } from "@opencast/appkit";


type PlaylistProps = {
    fragRef: PlaylistBlockData$key;
    basePath: string;
}

export const PlaylistBlock: React.FC<PlaylistProps> = ({ fragRef, basePath }) => {
    const { t } = useTranslation();
    const { playlist, showTitle, showMetadata, layout, order } = useFragment(graphql`
        fragment PlaylistBlockData on PlaylistBlock {
            playlist {
                __typename
                ... on NotAllowed { dummy } # workaround
                ... on AuthorizedPlaylist {
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
            showTitle
            showMetadata
            order
            layout
        }
    `, fragRef);

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

    return <VideoListBlock
        initialLayout={layout}
        initialOrder={(order === "%future added value" ? undefined : order) ?? "ORIGINAL"}
        allowOriginalOrder
        title={playlist.title ?? (showTitle ? playlist.title : undefined)}
        description={(showMetadata && playlist.description) || undefined}
        basePath={basePath}
        items={items}
        isPlaylist
    />;
};
