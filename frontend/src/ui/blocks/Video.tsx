import { Block } from "../Blocks";
import { Player } from "../Player";


type Props = {
    mediaUrl: string;
};

export const VideoBlock: React.FC<Props> = ({ mediaUrl }) => (
    <Block>
        <Player mediaUrl={mediaUrl} />
    </Block>
);
