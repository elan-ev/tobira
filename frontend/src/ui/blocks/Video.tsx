import { Block } from "../Blocks";
import { Player } from "../Player";
import type { Track } from "../Player";


type Props = {
    tracks: Track[];
};

export const VideoBlock: React.FC<Props> = ({ tracks }) => (
    <Block>
        <Player tracks={tracks} />
    </Block>
);
