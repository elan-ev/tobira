import { useEffect, useRef } from "react";
import { Config, Manifest, Mp4Source, Paella } from "paella-core";
import getBasicPluginsContext from "paella-basic-plugins";

import { Track } from ".";
import { SPEEDS } from "./consts";
import { bug } from "../../util/err";


type PaellaPlayerProps = {
    title: string;
    duration: number;
    tracks: Track[];
};

const PaellaPlayer: React.FC<PaellaPlayerProps> = ({ tracks, title, duration }) => {
    const ref = useRef<HTMLDivElement>(null);
    const paella = useRef<Paella>();

    useEffect(() => {
        // If the ref is not set yet (which should not usually happen), we do
        // nothing.
        if (!ref.current) {
            return;
        }

        // Otherwise we check weather Paella is already initialized. If not, we
        // do that now and set the initialized instance to `ref.current.paella`.
        if (!paella.current) {
            // Video/event specific information we have to give to Paella.
            const presentationTracks = tracks.filter(t => t.flavor.startsWith("presentation"));
            const presenterTracks = tracks.filter(t => t.flavor.startsWith("presenter"));
            const manifest = {
                metadata: { title, duration },
                streams: [
                    {
                        content: "presentation",
                        sources: {
                            mp4: presentationTracks.map(trackToPaellaSource),
                        },
                    },
                    {
                        content: "presenter",
                        sources: {
                            "mp4": presenterTracks.map(trackToPaellaSource),
                        },
                    },
                ],
            };

            paella.current = new Paella(ref.current, {
                // Paella has a weird API unfortunately. It by default loads two
                // files via `fetch`. But we can provide that data immediately
                // since we just derive it from our GraphQL data. So we
                // override all functions (which Paella luckily allows) to do
                // nothing except immediately return the data.
                loadConfig: async () => PAELLA_CONFIG as Config,
                getVideoId: async () => "dummy-id",
                getManifestUrl: async () => "dummy-url",
                getManifestFileUrl: async () => "dummy-file-url",
                loadVideoManifest: async (): Promise<Manifest> => manifest,
                customPluginContext: [
                    getBasicPluginsContext(),
                ],
            });
            paella.current.loadManifest();
        }

        const paellaSnapshot = paella.current;
        return () => {
            paellaSnapshot.unload();
            paella.current = undefined;
        };
    }, [tracks, title, duration]);

    return (
        <div
            ref={ref}
            css={{
                height: "100%",
                overflow: "hidden",
                margin: "auto",

                // Override stuff that Paella applies
                left: "unset",
                top: "unset",
                fontFamily: "unset",
            }}
        />
    );
};

const PAELLA_CONFIG = {
    logLevel: "WARN",

    plugins: {
        "es.upv.paella.singleVideo": {
            enabled: true,
            validContent: [
                {
                    id: "presenter",
                    content: ["presenter"],
                    icon: "present-mode-2.svg",
                    title: "Presenter",
                },
                {
                    id: "presentation",
                    content: ["presentation"],
                    icon: "present-mode-1.svg",
                    title: "Presentation",
                },
                {
                    id: "presenter-2",
                    content: ["presenter-2"],
                    icon: "present-mode-1.svg",
                    title: "Presentation",
                },
            ],
        },
        "es.upv.paella.dualVideo": {
            enabled: true,
            validContent: [
                {
                    id: "presenter-presentation",
                    content: ["presenter", "presentation"],
                    icon: "present-mode-3.svg",
                    title: "Presenter and presentation",
                },
                {
                    id: "presenter-2-presentation",
                    content: ["presenter-2", "presentation"],
                    icon: "present-mode-3.svg",
                    title: "Presenter and presentation",
                },
                {
                    id: "presenter-presenter-2",
                    content: ["presenter", "presenter-2"],
                    icon: "present-mode-3.svg",
                    title: "Presenter and presentation",
                },
            ],
        },
        "es.upv.paella.videoCanvas": {
            enabled: true,
            order: 1,
        },
        "es.upv.paella.mp4VideoFormat": {
            enabled: true,
            order: 1,
        },

        // Buttons on the left side
        "es.upv.paella.playPauseButton": {
            enabled: true,
            side: "left",
        },
        "es.upv.paella.volumeButtonPlugin": {
            enabled: true,
            side: "left",
        },

        // Buttons on the right side
        "es.upv.paella.captionsSelectorPlugin": {
            enabled: true,
            side: "right",
        },
        "es.upv.paella.playbackRateButton": {
            enabled: true,
            side: "right",
            rates: SPEEDS,
        },
        "es.upv.paella.qualitySelector": {
            enabled: true,
            side: "right",
        },
        "es.upv.paella.fullscreenButton": {
            enabled: true,
            side: "right",
        },
    },
};

const trackToPaellaSource = (t: Track): Mp4Source => {
    const [w, h] = t.resolution || bug("missing track resolution");
    return {
        src: t.uri,
        // TODO: what to do if `t.mimetype` is not mp4 or not specified?
        mimetype: "video/mp4" as const,
        res: { w, h },
    };
};

export default PaellaPlayer;
