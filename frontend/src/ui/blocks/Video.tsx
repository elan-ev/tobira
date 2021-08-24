import { Block } from "../Blocks";
import { Player } from "../player";
import type { Track } from "../player";


type Props = {
    tracks: Track[];
};

export const VideoBlock: React.FC<Props> = ({ tracks }) => (
    <Block>
        <Player tracks={tracks} />
    </Block>
);
