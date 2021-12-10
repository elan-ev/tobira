import { BlockContainer } from ".";
import { Player, PlayerProps } from "../player";


export const VideoBlock: React.FC<PlayerProps> = props => (
    <BlockContainer>
        <Player {...props} />
    </BlockContainer>
);
