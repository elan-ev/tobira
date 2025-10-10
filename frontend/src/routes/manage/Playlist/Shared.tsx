import { SinglePlaylist } from ".";
import { ThumbnailStack } from "../../../ui/ThumbnailStack";


export const PlaylistThumbnail: React.FC<{
    playlist: Pick<SinglePlaylist, "title" | "thumbnailStack">
}> = ({ playlist }) => <div css={{ position: "relative", "> div": { width: "100%" } }}>
    <ThumbnailStack
        thumbnails={playlist.thumbnailStack.thumbnails}
        title={playlist.title}
    />
</div>;
