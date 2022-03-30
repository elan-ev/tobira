import React, { Suspense } from "react";
import { useTranslation } from "react-i18next";

import { MAIN_PADDING } from "../../layout/Root";
import { Spinner } from "../Spinner";
import PaellaPlayer from "./Paella";
import PlyrPlayer from "./Plyr";


export type PlayerProps = {
    coverImage: string | null;
    title: string;
    duration: number;
    tracks: Track[];
    className?: string;
};

export type Track = {
    uri: string;
    flavor: string;
    mimetype: string | null;
    resolution: number[] | null;
};

export const Player: React.FC<PlayerProps> = ({
    className,
    tracks,
    coverImage,
    title,
    duration,
}) => {
    const flavors = new Set(tracks.map(t => t.flavor));
    const usePaella = flavors.size > 1;

    // Find a suitable aspect ratio for our height/width limiting below. For
    // Paella, we just use 16:9 because it's unclear what else we should use
    // with multi stream video.
    const aspectRatio = usePaella ? [16, 9] : tracks[0].resolution ?? [16, 9];

    return (
        <div className={className} css={{
            // We want to make sure that the player does not take up all the
            // vertical and horizontal page, as this could make scrolling hard.
            // And if users want that, there is a fullscreen mode for a reason.
            // So here we just say: there should be always 10% + 80px of
            // vertical space left (not taken up by the player). The height of
            // the players is actually best controlled by setting the width.
            maxWidth: `calc((90vh - 80px) * ${aspectRatio[0] / aspectRatio[1]})`,
            minWidth: "320px",
            margin: "auto",
            aspectRatio: `${aspectRatio[0]} / ${aspectRatio[1]}`,

            // If the player gets too small, the controls are pretty crammed, so
            // we used all available width.
            "@media (max-width: 380px)": {
                margin: `0 -${MAIN_PADDING}px`,
            },
        }}>
            <Suspense fallback={<PlayerFallback image={coverImage} />}>
                {usePaella
                    ? <LoadPaellaPlayer {...{ duration, title, tracks }} />
                    : <LoadPlyrPlayer {...{ title, tracks }} />}
            </Suspense>
        </div>
    );
};

const LoadPaellaPlayer = PaellaPlayer;
const LoadPlyrPlayer = PlyrPlayer;

const PlayerFallback: React.FC<{ image: string | null }> = ({ image }) => {
    const { t } = useTranslation();

    return (
        <div css={{
            position: "relative",
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
        }}>
            {image && <img src={image} css={{
                objectFit: "cover",
                opacity: 0.5,
                position: "absolute",
                width: "100%",
                height: "100%",
            }} />}
            <div css={{
                zIndex: 10,
                padding: 16,
                minWidth: 140,
                textAlign: "center",
                borderRadius: 4,
                backgroundColor: "rgba(255 255 255 / 50%)",
                border: "1px solid rgba(255 255 255 / 15%)",
                "@supports(backdrop-filter: none)": {
                    backgroundColor: "rgba(255 255 255 / 10%)",
                    backdropFilter: "blur(5px)",
                },
            }}>
                <Spinner size={32} />
                <div css={{ marginTop: 8 }}>{t("loading")}</div>
            </div>
        </div>
    );
};
