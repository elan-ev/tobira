import React from "react";

import { PaellaPlayer } from "./Paella";
import { PlyrPlayer } from "./Plyr";


export type PlayerProps = {
    title: string;
    duration: number;
    tracks: Track[];
};

export type Track = {
    uri: string;
    flavor: string;
    mimetype: string | null;
    resolution: number[] | null;
};

export const Player: React.FC<PlayerProps> = props => {
    const flavors = new Set(props.tracks.map(t => t.flavor));
    return flavors.size === 1
        ? <PlyrPlayer {...props} />
        : <PaellaPlayer {...props} />;
};
