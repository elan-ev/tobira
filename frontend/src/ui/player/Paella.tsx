import { useEffect, useRef } from "react";
import { Config, Manifest, Paella, Source, Stream } from "paella-core";
import getBasicPluginsContext from "paella-basic-plugins";
import getZoomPluginContext from "paella-zoom-plugin";
import getMP4MultiQualityContext from "paella-mp4multiquality-plugin";
import getUserTrackingPluginsContext from "paella-user-tracking";
import getSlidePluginsContext from "paella-slide-plugins";
import { Global } from "@emotion/react";
import { useTranslation } from "react-i18next";

import { isHlsTrack, PlayerEvent, Track } from ".";
import { SPEEDS, TRANSLATIONS } from "./consts";
import { timeStringToSeconds } from "../../util";
import { usePlayerContext } from "./PlayerContext";
import { usePlayerGroupContext } from "./PlayerGroupContext";
import CONFIG from "../../config";
import i18n from "../../i18n";
import { SKIP_INTERVAL } from "./consts";


type PaellaPlayerProps = {
    event: PlayerEvent;
};

export type PaellaState = {
    player: Paella;
    loadPromise: Promise<void>;
};

const PaellaPlayer: React.FC<PaellaPlayerProps> = ({ event }) => {
    const { t, i18n } = useTranslation();
    const ref = useRef<HTMLDivElement>(null);
    const { paella, setPlayerIsLoaded } = usePlayerContext();
    const { players, register, unregister } = usePlayerGroupContext();

    useEffect(() => {
        // If the ref is not set yet (which should not usually happen), we do
        // nothing.
        if (!ref.current) {
            return;
        }

        // Otherwise we check whether Paella is already initialized. If not, we
        // do that now and set the initialized instance to `ref.current.paella`.
        if (!paella.current) {
            // Video/event specific information we have to give to Paella.
            const tracksByKind: Record<string, Track[]> = {};
            for (const track of event.authorizedData.tracks) {
                const kind = track.flavor.split("/")[0];
                if (!(kind in tracksByKind)) {
                    tracksByKind[kind] = [];
                }
                tracksByKind[kind].push(track);
            }

            let fixedDuration = event.syncedData.duration;
            const { startTime, endTime } = event.syncedData;
            if (fixedDuration === 0 && startTime && endTime) {
                const diffMs = (new Date(endTime).getTime() - new Date(startTime).getTime());
                fixedDuration = diffMs / 1000;
            }

            // Paella just crashes if we pass a 0 duration, so... we just pass
            // 1. It's not like Paella is using it for anything as far as I can
            // see. The correct duration of the loaded video is used.
            if (fixedDuration === 0) {
                fixedDuration = 1;
            }

            // We add numbers to the labels if there would otherwise be two same labels.
            const captionNumbering = event.authorizedData.captions.length
                !== new Set(event.authorizedData.captions.map(({ lang }) => lang ?? null)).size;
            const manifest: Manifest = {
                metadata: {
                    title: event.title,
                    duration: fixedDuration,
                    preview: event.syncedData.thumbnail,

                    // These are not strictly necessary for Paella to know, but can be used by
                    // plugins, like the Matomo plugin. It is not well defined what to pass how,
                    // but we just copy what the Opencast integration does:
                    // https://github.com/opencast/opencast/blob/e08812b52a94469dee586909ae414cca85508168/modules/engage-paella-player-7/src/js/EpisodeConversor.js#L134-L152
                    description: event.description,
                    seriestitle: event.series?.title, // Yes, no camelCase, lowercase t.
                    series: event.series?.opencastId,
                    presenters: event.creators, // Also yes, the name mismatch is intended.
                    license: event.metadata.dcterms?.license,
                    location: event.metadata.dcterms?.spatial,
                    isLive: event.isLive, // Not passed by the OC integration, but useful.
                },
                streams: Object.entries(tracksByKind).map(([key, tracks]) => ({
                    content: key,
                    sources: tracksToPaellaSources(tracks, event.isLive),
                })),
                captions: event.authorizedData.captions.map(({ uri, lang }, index) => ({
                    format: "vtt",
                    url: uri,
                    lang: lang ?? undefined,
                    // We try to come up with usable labels for the tracks. This should be
                    // improved in the future, hopefully by getting better information.
                    text: t("video.caption")
                        + (lang ? ` (${lang})` : "")
                        + (captionNumbering ? ` [${index + 1}]` : ""),
                })),
                frameList: event.authorizedData.segments.map(segment => {
                    const time = segment.startTime / 1000;
                    return {
                        id: "frame_" + time,
                        mimetype: "image/jpeg",
                        time,
                        url: segment.uri,
                        thumb: segment.uri,
                    };
                }),
            };

            // If there are no presenter tracks (and there is more than one
            // stream), Paella needs us to tell it which stream should function
            // as the main audio source. We don't know either, so we pick one
            // at random.
            if (manifest.streams.length > 1 && !("presenter" in tracksByKind)) {
                // eslint-disable-next-line no-console
                console.warn("Picking first stream as main audio source. Tracks: ",
                    event.authorizedData.tracks);
                manifest.streams[0].role = "mainAudio";
            }

            const player = new Paella(ref.current, {
                // Paella has a weird API unfortunately. It by default loads two
                // files via `fetch`. But we can provide that data immediately
                // since we just derive it from our GraphQL data. So we
                // override all functions (which Paella luckily allows) to do
                // nothing except immediately return the data.
                loadConfig: async () => PAELLA_CONFIG as Config,
                getVideoId: async () => event.opencastId,
                getManifestUrl: async () => "dummy-url",
                getManifestFileUrl: async () => "dummy-file-url",
                loadVideoManifest: async () => manifest,
                loadDictionaries: (player: Paella) => {
                    Object.entries(TRANSLATIONS).forEach(([lang, dict]) => {
                        player.addDictionary(lang, dict);
                    });
                    player.setLanguage(i18n.language);
                },
                configResourcesUrl: "/~assets/paella",
                customPluginContext: [
                    getBasicPluginsContext(),
                    getZoomPluginContext(),
                    getUserTrackingPluginsContext(),
                    getMP4MultiQualityContext(),
                    getSlidePluginsContext(),
                ],
            });


            if (!event.isLive) {
                const time = new URL(window.location.href).searchParams.get("t");
                player.bindEvent("paella:playerLoaded", () => {
                    setPlayerIsLoaded(true);
                    if (time) {
                        player.videoContainer.setCurrentTime(timeStringToSeconds(time));
                    }
                });
            }

            player.bindEvent("paella:play", () => {
                players?.forEach(playerInstance => {
                    if (playerInstance && playerInstance !== player) {
                        playerInstance.videoContainer.pause();
                    }
                });
            });

            register(player);

            const loadPromise = player.skin.loadSkin("/~assets/paella/theme.json")
                .then(() => player.loadManifest());
            paella.current = { player, loadPromise };
        }

        const paellaSnapshot = paella.current;
        return () => {
            unregister(paellaSnapshot.player);
            paella.current = undefined;
            paellaSnapshot.loadPromise.then(() => {
                paellaSnapshot.player.unload();
            });
        };
    }, [event, t]);

    // This is `neutral10` in dark mode. We hard code this here as it's really
    // not important that an adjusted neutral tone is reflected in the player.
    // We just want to override the default dark blue.
    const toolbarBg = "#1e1e1e";
    const colors = {
        "--main-bg-color": toolbarBg,
        "--main-bg-gradient": `color-mix(in srgb, ${toolbarBg} 80%, transparent)`,
        "--secondary-bg-color": "#2e2e2e",
        "--secondary-bg-color-hover": `color-mix(in srgb, ${toolbarBg} 90%, transparent)`,
        "--highlight-bg-color": "#444",
        "--highlight-bg-color-hover": "#444",
        "--highlight-bg-color-progress-indicator": "var(--color-player-accent-light)",
        "--volume-slider-fill-color": "var(--color-player-accent-light)",
        "--volume-slider-empty-color": "#555",
        "--video-container-background-color": "#000",
        "--base-video-rect-background-color": "#000",
    };

    return <>
        <Global styles={{
            "body > .popup-container": colors,
            "body:has(.paella-fallback-fullscreen)": {
                overflow: "hidden",
            },
            ".popup-container": {
                zIndex: 500050,
                "& .button-group": {
                    "& .button-plugin-wrapper:hover, button:hover": {
                        backgroundColor: "var(--highlight-bg-color-hover)",
                    },
                },
                '& button[name="es.upv.paella.qualitySelector"] div': {
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    i: {
                        display: "none",
                    },
                    span: {
                        color: "var(--main-fg-color)",
                        backgroundColor: "var(--main-bg-color)",
                        border: "2px solid var(--main-fg-color)",
                        borderRadius: 3,
                        margin: "0 !important",
                        fontSize: "10px !important",
                        fontWeight: "bold",
                        padding: "2px 3px",
                    },
                },
            },
            ".paella-fallback-fullscreen": {
                position: "fixed !important" as "fixed",
                inset: "0 !important",
                zIndex: "499 !important",
            },
        }} />
        <div
            // We use `key` here to force React to re-create this `div` and not
            // reuse the old one. This is useful as Paella's cleanup function
            // sometimes does not clean everything. We can (and should) always
            // report those bugs and then update Paella, but this way we avoid
            // all these problems. And re-rendering the div is really not
            // problematic as it doesn't have many children.
            key={event.opencastId}
            ref={ref}
            css={{
                height: "100%",
                overflow: "hidden",

                // Override stuff that Paella applies
                left: "unset",
                top: "unset",
                fontFamily: "unset",

                ...colors,

                // Buttons inside video containers
                "& .video-canvas": {
                    containerName: "video-canvas",
                    containerType: "inline-size",
                },
                "@container video-canvas (width < 400px)": {
                    "& .button-area": {
                        padding: "2px !important",
                        top: "unset !important",
                        "& button": {
                            transform: "scale(0.7)",
                            margin: "-3px !important",
                        },
                    },
                },

                "& .playback-bar": {
                    transition: "background 0.08s",
                },
                "& .progress-indicator-remaining": {
                    backgroundColor: "#9e9e9e !important",
                },
                "& .progress-indicator-content": {
                    opacity: "unset",
                },

                '& div[name="es.upv.paella.customTimeProgressIndicator"]': {
                    fontWeight: "bold",
                },

                '& button[name="es.upv.paella.backwardButtonPlugin"] div': {
                    marginTop: "-7px !important",
                    "svg text": {
                        transform: "translate(0px, -1px)",
                        fontFamily: "var(--main-font) !important",
                    },
                },
                '& button[name="es.upv.paella.forwardButtonPlugin"] div': {
                    marginTop: "-7px !important",
                    "svg text": {
                        transform: "translate(2px, -1px)",
                        fontFamily: "var(--main-font) !important",
                    },
                },

                "button:has(.preview-play-icon), & .loader-container i": {
                    maxWidth: 150,
                },

                "& .preview-play-icon, & .loader-container i": {
                    color: "#ecf0f1",
                    opacity: ".8 !important",
                    transition: "opacity 0.08s",

                    "> svg": {
                        strokeWidth: 1.5,
                        filter: "drop-shadow(0 0 1px #000)",
                    },
                },

                ":hover .preview-play-icon, .loader-container i": {
                    opacity: "1 !important",
                },
            }}
        />
    </>;
};

const PAELLA_CONFIG = {
    logLevel: "WARN",
    defaultVideoPreview: "/~assets/1x1-black.png",
    ui: {
        hideUITimer: 2000,
        hideOnMouseLeave: true,
    },
    defaultLayout: "presenter-presentation",
    defaultLanguage: "en",

    preferences: {
        currentSource: "dataPlugin",
        sources: {
            dataPlugin: {
                context: "preferences",
            },
        },
    },

    videoContainer: {
        restoreVolume: true,
        restoreLastTime: {
            enabled: true,
            remainingSeconds: 5,
        },
        restoreVideoLayout: {
            enabled: true,
            global: false,
        },
    },

    buttonGroups: [
        {
            enabled: true,
            groupName: "optionsContainer",
            // These cannot be changed dynamically, but using translations here will
            // at least work for users that don't usually switch their language.
            description: i18n.t("player.options.title"),
            icon: CONFIG.paellaSettingsIcon.replace(/^\/~assets\/paella/, ""),
            order: 6,
            side: "right",
            tabIndex: 6,
            parentContainer: "playbackBar",
            ariaLabel: i18n.t("player.options.label"),
        },
    ],

    plugins: {
        "es.upv.paella.singleVideoDynamic": {
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
        "es.upv.paella.dualVideoDynamic": {
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
            tabIndexStart: 11,
        },

        // Canvas plugins
        "es.upv.paella.videoCanvas": {
            enabled: true,
            order: 1,
        },
        "es.upv.paella.zoomPlugin": {
            enabled: true,
            order: 0,
        },

        // Format plugins
        "es.upv.paella.mp4MultiQualityVideoFormat": {
            enabled: true,
            order: 1,
            crossOrigin: false,
        },
        "es.upv.paella.hlsVideoFormat": {
            enabled: true,
            order: 0,
            crossOrigin: false,
            corsConfig: {
                withCredentials: false,
                requestHeaders: {
                    "Access-Control-Allow-Credentials": false,
                },
            },
        },
        "es.upv.paella.hlsLiveVideoFormat": {
            enabled: true,
            order: 0,
            crossOrigin: false,
            corsConfig: {
                withCredentials: false,
                requestHeaders: {
                    "Access-Control-Allow-Credentials": false,
                },
            },
        },
        "es.upv.paella.vttManifestCaptionsPlugin": {
            enabled: true,
        },

        // Buttons on the left side
        "es.upv.paella.playPauseButton": {
            enabled: true,
            side: "left",
            order: 0,
            tabIndex: 1,
        },
        "es.upv.paella.customTimeProgressIndicator": {
            enabled: true,
            textSize: "large",
            showTotal: true,
            order: 1,
        },
        "es.upv.paella.backwardButtonPlugin": {
            enabled: true,
            side: "left",
            order: 2,
            time: SKIP_INTERVAL,
            suffix: false,
            tabIndex: 2,
        },
        "es.upv.paella.forwardButtonPlugin": {
            enabled: true,
            side: "left",
            order: 3,
            time: SKIP_INTERVAL,
            suffix: false,
            tabIndex: 3,
        },
        "es.upv.paella.playbackRateButton": {
            enabled: true,
            showIcon: false,
            rates: SPEEDS,
            side: "left",
            order: 4,
            tabIndex: 4,
        },
        "es.upv.paella.volumeButtonPlugin": {
            enabled: true,
            side: "left",
            order: 5,
            tabIndex: 5,
        },

        // Buttons on the right side inside settings menu
        "es.upv.paella.qualitySelector": {
            enabled: true,
            side: "right",
            order: 6,
            tabIndex: 6,
            parentContainer: "optionsContainer",
            showForSingleQuality: true,
        },
        "es.upv.paella.layoutSelector": {
            enabled: true,
            side: "right",
            showIcons: false,
            order: 7,
            tabIndex: 7,
            parentContainer: "optionsContainer",
        },

        // Buttons on the right side outside of settings menu
        "es.upv.paella.captionsSelectorPlugin": {
            enabled: true,
            side: "right",
            order: 9,
            tabIndex: 9,
        },
        "es.upv.paella.fullscreenButton": {
            enabled: true,
            side: "right",
            order: 10,
            tabIndex: 10,
        },

        "es.upv.paella.slideMapProgressBarPlugin": {
            enabled: true,
            markColor: {
                mouseOut: "#0A0A0A",
                mouseHover: "#A9A9A9",
            },
            markWidth: 3,
            drawBackground: false,
        },

        "es.upv.paella.prevSlideNavigatorButton": {
            enabled: true,
            content: ["presentation"],
            order: 0,
        },
        "es.upv.paella.nextSlideNavigatorButton": {
            enabled: true,
            content: ["presentation"],
            order: 1,
        },

        // Data plugin
        "es.upv.paella.localStorageDataPlugin": {
            enabled: true,
            order: 0,
            context: ["default", "trimming"],
        },

        // Let admin provided config add and override entries.
        ...CONFIG.paellaPluginConfig,
    },
};

const tracksToPaellaSources = (tracks: Track[], isLive: boolean): Stream["sources"] => {
    const trackToSource = (t: Track): Source => {
        const [w, h] = t.resolution ?? [0, 0];
        return {
            src: t.uri,
            // TODO: what to do if `t.mimetype` is not mp4 or not specified?
            mimetype: "video/mp4" as const,
            res: { w, h },
        };
    };

    const hlsTracks = tracks.filter(isHlsTrack)
        // Make sure a/the master playlist is in front, so that quality selection works
        .sort((a, b) => Number(b.isMaster) - Number(a.isMaster));
    const mp4Tracks = tracks.filter(t => !isHlsTrack(t));

    const hlsKey = isLive ? "hlsLive" : "hls";

    return {
        ...mp4Tracks.length > 0 && { "mp4": mp4Tracks.map(trackToSource) },
        ...hlsTracks.length > 0 && { [hlsKey]: hlsTracks.map(trackToSource) },
    };
};

export default PaellaPlayer;
