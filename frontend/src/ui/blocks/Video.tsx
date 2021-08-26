import { Block } from "../Blocks";
import { Player, PlayerProps } from "../player";


export const VideoBlock: React.FC<PlayerProps> = props => (
    <Block>
        <Player {...props} />
    </Block>
);
