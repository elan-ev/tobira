import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Manifest, Paella, Source, Stream } from "@asicupv/paella-core";
import { basicPlugins } from "@asicupv/paella-basic-plugins";
import { zoomPlugins } from "@asicupv/paella-zoom-plugin";
import { userTrackingPlugins } from "@asicupv/paella-user-tracking";
import { videoPlugins } from "@asicupv/paella-video-plugins";
import { slidePlugins } from "@asicupv/paella-slide-plugins";
import coreStyles from "@asicupv/paella-core/paella-core.css";
import basicPluginStyles from "@asicupv/paella-basic-plugins/paella-basic-plugins.css";
import slidePluginStyles from "@asicupv/paella-slide-plugins/paella-slide-plugins.css";
import zoomPluginStyles from "@asicupv/paella-zoom-plugin/paella-zoom-plugin.css";
import { css, Global } from "@emotion/react";
import { screenWidthAtMost } from "@opencast/appkit";

import { getPlayerAspectRatio, isHlsTrack, PlayerEvent, Track } from ".";
import { SPEEDS, TRANSLATIONS } from "./consts";
import { captionsWithLabels, timeStringToSeconds } from "../../util";
import { usePlayerContext } from "./PlayerContext";
import { usePlayerGroupContext } from "./PlayerGroupContext";
import { installVolumeSlider } from "./volumeSlider";
import { installSeekBarTapHandler } from "./seekBar";
import CONFIG from "../../config";
import i18n from "../../i18n";
import { SKIP_INTERVAL } from "./consts";
import { BREAKPOINT_SMALL } from "../../GlobalStyle";


type PaellaPlayerProps = {
    event: PlayerEvent;
};

export type PaellaState = {
    player: Paella;
    loadPromise: Promise<void>;
    removeHandlers?: (() => void)[];
};

/**
 * Wraps Paella's own CSS so that it only applies inside the player.
 *
 * We have to load that CSS ourselves since Paella 8 ships it as separate files
 * instead of putting it into the JS. And sadly we can't just throw it into the
 * page as is, because a few of its rules aren't limited to the player at all:
 * it styles every single `svg` (including `pointer-events: none`, which would
 * break all of our icon buttons), sets a font size on every `button` and `a`,
 * and puts ~150 variables on `:root`. So everything goes inside
 * `.player-container`. We use `:where` for that, as it doesn't count towards
 * specificity, so Paella's rules keep the weight they were written with and our
 * own overrides below still win.
 *
 * The two replacements are a bit annoying:
 *
 * - Paella's rules that already talk about `:root` or `.player-container` mean
 *   *our* wrapper, not something inside it, so those become `&`.
 * - Selectors starting with a `:` get glued right onto the wrapper instead of
 *   being nested below it. Paella's `:is(button, a) .button-title-small` would
 *   turn into `.player-container:is(button, a) ...`, and our player div is
 *   neither a button nor a link, so that would simply never match anything. The
 *   `& ` we stick in front makes them descendants again. We only do that at the
 *   start of a rule, because a `:` after a comma could be either case
 *   (`:is(a, :hover)` vs `.a, :hover`) — luckily Paella has no selector list
 *   that starts with a pseudo class.
 */
const scopePaellaCss = (packageCss: string) => css`
    :where(.player-container) {
        ${packageCss
        .replaceAll(/:root|\.player-container/gu, "&")
        .replaceAll(/(^|[{}])\s*(::?[a-zA-Z-])/gu, "$1& $2")}
    }
`;

const PAELLA_PACKAGE_STYLES = [
    coreStyles,
    basicPluginStyles,
    slidePluginStyles,
    zoomPluginStyles,
].map(scopePaellaCss);


const PaellaPlayer: React.FC<PaellaPlayerProps> = ({ event }) => {
    const { t, i18n } = useTranslation();
    const ref = useRef<HTMLDivElement>(null);
    const { paella, setPlayerIsLoaded } = usePlayerContext();
    const { players, register, unregister, setActivePlayer } = usePlayerGroupContext();

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

            const manifest: Manifest = {
                metadata: {
                    title: event.title,
                    duration: fixedDuration,
                    preview: event.syncedData.thumbnail ?? undefined,

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
                    timelineMarks: "frameList",
                },
                streams: Object.entries(tracksByKind).map(([key, tracks]) => ({
                    content: key,
                    sources: tracksToPaellaSources(tracks, event.isLive),
                })),
                captions: captionsWithLabels(event.authorizedData.captions, t).map(
                    ({ label, caption }) => ({
                        id: caption.uri,
                        format: "vtt",
                        url: caption.uri,
                        lang: caption.lang ?? "",
                        text: label,
                    }),
                ),
                frameList: {
                    targetContent: "presentation",
                    frames: event.authorizedData.segments.map(segment => {
                        const time = segment.startTime / 1000;
                        return {
                            id: "frame_" + time,
                            mimetype: "image/jpeg",
                            time,
                            url: segment.uri,
                            thumb: segment.uri,
                        };
                    }),
                },
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
                // Paella 8 fetches its configuration and the video manifest by
                // default. We have both already (they are derived from our
                // GraphQL data) so these hand them over directly and Paella
                // makes no request of its own.
                loadConfig: async () => PAELLA_CONFIG,
                getVideoId: async () => event.opencastId,
                loadVideoManifest: async () => manifest,
                loadDictionaries: async (player: Paella) => {
                    Object.entries(TRANSLATIONS).forEach(([lang, dict]) => {
                        player.addDictionary(lang, dict);
                    });
                    player.setLanguage(i18n.language);
                },
                configResourcesUrl: "/~assets/paella",
                plugins: [
                    ...basicPlugins,
                    ...zoomPlugins,
                    ...userTrackingPlugins,
                    ...videoPlugins,
                    ...slidePlugins,
                ],
            });


            player.bindEvent("paella:playerLoaded", () => {
                setPlayerIsLoaded(true);
                register(player);
                const time = new URL(window.location.href).searchParams.get("t");
                if (!event.isLive && time) {
                    player.videoContainer?.setCurrentTime(timeStringToSeconds(time));
                }
                writeSkipIntervalIntoIcons(player);
            });

            player.bindEvent("paella:play", () => {
                setActivePlayer(player);
                players.forEach((playerInstance: Paella) => {
                    if (playerInstance && playerInstance !== player) {
                        playerInstance.videoContainer?.pause();
                    }
                });
            });

            const removeHandlers = [
                installUiActivityHandlers(player),
                installVolumeSlider(player),
                installSeekBarTapHandler(player),
            ];

            const loadPromise = player.skin.loadSkin(CONFIG.paellaThemeJson)
                .then(() => player.loadManifest());
            paella.current = { player, loadPromise, removeHandlers };
        }

        const paellaSnapshot = paella.current;
        return () => {
            paellaSnapshot.removeHandlers?.forEach(remove => remove());
            unregister(paellaSnapshot.player);
            paella.current = undefined;
            paellaSnapshot.loadPromise.then(() => {
                // Hacky workaround alert:
                // The `setTimeout` seems to be necessary in dev (sth sth StrictMode)
                // since Paella 8's `loadManifest` resolves slightly too early.
                // Unloading immediately after loading causes incomplete plugin data,
                // which then throws errors in console.
                // Deferring by a task lets that data load completely first.
                setTimeout(() => paellaSnapshot.player.unload());
            });
        };
    }, [event, t]);

    const aspectRatio = getPlayerAspectRatio(event.authorizedData.tracks);

    // This is `neutral10` in dark mode. We hard code this here as it's really
    // not important that an adjusted neutral tone is reflected in the player.
    // We just want to override the default dark blue.
    const toolbarBg = "#1e1e1e";
    const overrides = {
        "--main-bg-color": toolbarBg,
        "--main-fg-color": "#F9FAFB",

        // From `paella-skins`. Only used for the layout buttons of dual stream
        // videos, hence the odd blue-grey.
        "--main-bg-color-hover": "#1F2937",

        // From `paella-skins`. Paella references this for `:focus-visible`
        // outlines, but never defines it. Without it the outline falls back to
        // the text color.
        "--main-outline-color": "#f200f2",

        "--playback-bar-gradient": `color-mix(in srgb, ${toolbarBg} 80%, transparent)`,
        "--playback-bar-gradient-hover": `color-mix(in srgb, ${toolbarBg} 90%, transparent)`,
        "--playback-bar-backdrop-filter": "unset",
        "--playback-bar-backdrop-filter-hover": "unset",
        "--button-color": "#F9FAFB",
        "--icon-color": "#F9FAFB",
        "--highlight-bg-color": "#444",
        "--highlight-bg-color-hover": "#444",
        "--progress-indicator-elapsed-color": "var(--color-player-accent-light)",
        "--progress-indicator-remaining-color": "#555",
        "--video-container-background-color": "#000",
        "--base-video-rect-background-color": "#000",

        "--button-fixed-height": "40px",
        "--button-fixed-width": "40px",
        "--canvas-button-gap": "4px",
        "--canvas-button-height": "unset",
        "--canvas-button-container-padding": "8px",

        // Progress bar
        "--slide-marker-gap": "2px",
        "--handler-size": "16px",
        // This applies on hover:
        "--progress-indicator-slide-marker-height": "10px",

        // Pop-up menus
        "--popup-wrapper-padding": "5px",
        "--popup-border-radius": "3px",
        "--popup-box-shadow": `0 0 4px 0 ${toolbarBg}`,
        "--popup-padding": "0px 10px",
        "--popup-menu-item-height": "40px",
        "--popup-menu-item-font-size": "16px",
    };

    return <>
        <Global styles={[
            ...PAELLA_PACKAGE_STYLES,
            {
                "body:has(.paella-fallback-fullscreen)": {
                    overflow: "hidden",
                },
            },
        ]} />
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

                ...overrides,

                // The old paella version had this internally and it prevents a thin line above
                // the player in preview state on very specific screen widths
                // (starting from 328px and then in increments of 16px).
                // I don't wanna spend time investigating this further, so I'd rather just add these
                // overrides.
                ".video-container": {
                    position: "absolute",
                    top: "50%",
                    transform: "translateY(-50%)",
                },

                ".landscape-container": {
                    gap: 7,
                },

                // Buttons inside video containers
                "& .video-canvas": {
                    containerName: "video-canvas",
                    containerType: "inline-size",
                },
                "& .preview-container": {
                    backgroundColor: "#000 !important",
                    // The preview should occupy exactly the box that the video
                    // occupies once it is loaded, i.e. the video's aspect ratio
                    // fitted into the container. We cannot rely on the
                    // thumbnail's own aspect ratio for that, so
                    // instead we size this box via the video's aspect ratio
                    // (`height: 100%` plus `aspect-ratio`; the container is
                    // never narrower than the video, so the width always fits)
                    // and let `object-fit: cover` crop whatever bars the
                    // thumbnail brings along.
                    "> .preview-image-container": {
                        display: "block",
                        height: "100%",
                        width: "auto",
                        aspectRatio: `${aspectRatio[0]} / ${aspectRatio[1]}`,
                        flexShrink: 0,
                    },
                    "img": {
                        display: "block",
                        width: "100% !important",
                        height: "100% !important",
                        objectFit: "cover",
                    },
                },
                "& .button-area svg": {
                    fill: "var(--button-color)",
                },
                // From `paella-skins`.
                "& .video-canvas .button-area button": {
                    backgroundColor: "var(--highlight-bg-color-hover)",
                    boxSizing: "border-box",
                    width: 32,
                    height: 32,
                    padding: 4,
                },
                // From `paella-skins`.
                "& button": {
                    cursor: "pointer",
                },
                // From `paella-skins`. Buttons that are faded out should be
                // fully visible while focused. Paella draws the outline itself,
                // but does nothing about the opacity.
                "& button:focus-visible": {
                    opacity: 1,
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

                // Control bar elements
                "& .playback-bar": {
                    transition: "background 0.08s",
                    // From `paella-skins`.
                    userSelect: "none",

                    // Default appears to be "hidden",
                    // which actually hides the slide previews as well.
                    overflow: "visible",
                },

                // From `paella-skins`.
                "& .playback-bar .button-plugins": {
                    height: "calc(var(--button-fixed-height) - 1px)",
                    boxSizing: "content-box",
                    padding: 4,
                },

                "& .playback-bar-container, & .pop-up-wrapper": {
                    minHeight: 0,
                },

                "& .timeline-preview p": {
                    // Otherwise our global override would make the timestamps invisible.
                    color: "inherit",
                },

                // From `paella-skins`.
                "& .playback-bar button": {
                    fontWeight: "bold",
                },

                "& .playback-bar button i svg": {
                    fill: "var(--main-fg-color)",
                    color: "var(--main-fg-color)",
                },
                '& div[name="es.upv.paella.currentTimeLabel"]': {
                    fontWeight: "bold",
                    padding: "3px 5px 2px 5px",
                    span: {
                        fontSize: 12,
                    },
                },

                '& button[name="es.upv.paella.playbackRateButton"]': {
                    fontSize: 12,
                    padding: "0 9px",
                    paddingTop: 1,
                    minWidth: "unset !important",
                },

                '& button[name="es.upv.paella.playPauseButton"] i': {
                    height: "unset",
                },

                '& button[name="es.upv.paella.backwardButtonPlugin"] i': {
                    marginTop: "-7px !important",
                    height: "unset",
                    "svg text": {
                        transform: "translate(0px, -1px)",
                        fontFamily: "var(--main-font) !important",
                    },
                },
                '& button[name="es.upv.paella.forwardButtonPlugin"] i': {
                    marginTop: "-7px !important",
                    height: "unset",
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

                // From `paella-skins`. Paella gives the `<i>` a fixed pixel size
                // and spins it; this scales it with the player and spins the
                // icon inside instead, so that a non-square icon doesn't wobble.
                "& .loader-container i": {
                    width: "21%",
                    height: "unset",
                    aspectRatio: "1",
                    animation: "unset",

                    "svg": {
                        animation: "spin 1s linear infinite",
                    },
                },

                "& .progress-indicator": {
                    boxSizing: "border-box",
                    padding: 0,
                    // From `paella-skins`. Paella sizes this from the handler
                    // and slide markers, which makes for a very thin hit area,
                    // and lets it span the full width.
                    height: 26,
                    width: "calc(100% - 30px)",
                    marginLeft: 15,
                },

                "& .playback-bar nav": {
                    padding: "3.5px 9px",
                },

                ":hover .preview-play-icon, .loader-container i": {
                    opacity: "1 !important",
                },

                // Volume slider. See `volumeSlider.ts` for the JS side of this
                // and for why any of it is necessary.
                "& .volume-button + span": {
                    display: "flex",
                    marginLeft: 10,
                    input: {
                        width: 100,
                    },
                    // Strip the native track and thumb: the track should show
                    // our gradient and nothing else, to mirror our previous styling.
                    "input[type=range].isu": {
                        "::-moz-range-track": { height: 8, border: 0 },
                        "::-webkit-slider-runnable-track": { height: 8, border: 0 },
                        "::-moz-range-thumb": { appearance: "none", width: 0, border: 0 },
                        "::-webkit-slider-thumb": { appearance: "none", width: 0, border: 0 },

                        // Just don't ask, ok...
                        ":hover": {
                            display: "flex",
                        },
                    },
                },

                // Keep the slider visible while its button is hovered or
                // focused. Paella reveals the slider on the button's
                // `mouseover`/`focus` but re-hides it (adds `.hidden`, i.e.
                // `display: none`) shortly after the button loses focus — and
                // it blurs the button on every click. So muting/unmuting made
                // the already-open slider blink out again. This overrides that
                // hide while the pointer/focus is still on the control, so the
                // press no longer flickers the slider. Paella's own
                // `.side-container.hidden:hover`/`:focus-within` rules still
                // hide it once the control is left.
                ["& .volume-button:hover + .side-container, "
                    + "& .volume-button:focus + .side-container"]: {
                    display: "flex !important",
                },

                // Captions. All of these are from `paella-skins`.
                "& .captions-canvas": {
                    "& .text-container": {
                        backgroundColor:
                            "color-mix(in srgb, var(--main-bg-color) 70%, transparent)",
                        left: "15%",
                        right: "15%",
                        width: "unset",
                    },
                    "&.visible-ui .text-container": {
                        bottom: 75,
                    },
                    // Paella's own sizes are a good deal larger than what we want.
                    "&.size-s .text-container": { fontSize: 12, padding: 2 },
                    "&.size-m .text-container": { fontSize: 15, padding: 3 },
                    "&.size-l .text-container": { fontSize: 20, padding: 4 },
                    "&.size-xl .text-container": { fontSize: 25, padding: 5 },
                    "&.size-xxl .text-container": { fontSize: 30, padding: 6 },
                },


                // Several of our icons (the layout and captions ones, for
                // example) have no `fill` of their own and rely on being
                // colored from the outside, which Paella only does in the
                // playback bar. In a menu they would render black on black.
                // Icons that bring their own `fill` (usually `none`, being
                // stroke-only) have to be left alone.
                "& .pop-up-content .menu-icon svg:not([fill])": {
                    fill: "var(--icon-color)",
                },

                [`&.${UI_HIDDEN_CLASS} .playback-bar, &.${UI_HIDDEN_CLASS} .button-area`]: {
                    display: "none !important",
                },
                "&.paella-fallback-fullscreen": {
                    position: "fixed !important" as "fixed",
                    inset: "0 !important",
                    zIndex: "499 !important",
                },

                [screenWidthAtMost(600)]: {
                    "& .progress-indicator": {
                        marginBottom: "-9px",
                    },

                    "& .button-plugins": {
                        transform: "scale(0.9)",
                    },

                    "& .button-plugins.left-side": {
                        marginLeft: "-6px !important",
                    },

                    "& .button-plugins.right-side": {
                        marginRight: "-2px !important",
                        marginLeft: "-22px !important",
                    },

                    // While this could follow the same approach as the captions
                    // button (whose visibility is decided conditionally in the config
                    // when the player is initialized), I think it's better to have this
                    // responsive, even if this needs to resort to a... somewhat questionable
                    // css workaround. This way, the time is only circumcised in portrait mode
                    // but still fully visible in landscape.
                    // Does not account for videos lengths >= 100h.
                    '& div[name="es.upv.paella.currentTimeLabel"]': {
                        width: event.syncedData.duration < 3600000 ? "5ch" : "8ch",
                        overflowY: "hidden",
                    },
                },

                [screenWidthAtMost(BREAKPOINT_SMALL)]: {
                    "& .pop-up .pop-up-content": {
                        transform: "scale(0.9)",
                        padding: "4px 0",
                    },

                    // Volume slider. On iOS, the volume button itself is completely
                    // hidden, but I think that having at the least the option to mute a
                    // video is a good thing, so we keep it on other devices. But just in
                    // case, this forces the slider to hide, mainly to prevent the
                    // inconsistent behavior mentioned above.
                    "& input[type=range].isu": {
                        display: "none !important",
                    },
                },

                [screenWidthAtMost(330)]: {
                    // Volume slider. Below 331px we always hide the button to
                    // prevent line breaks.
                    "& .volume-button": {
                        display: "none !important",
                    },
                },
            }}
        />
    </>;
};


export const UI_HIDDEN_CLASS = "paella-ui-hidden";

const installUiActivityHandlers = (player: Paella) => {
    const container = player.containerElement;
    const onActivity = () => {
        if (container.classList.contains(UI_HIDDEN_CLASS)) {
            container.classList.remove(UI_HIDDEN_CLASS);
        }
    };

    const events: (keyof HTMLElementEventMap)[] = [
        "mousemove", "pointerdown", "wheel", "touchstart",
    ];

    events.forEach(e => container.addEventListener(e, onActivity));

    return () => events.forEach(e => container.removeEventListener(e, onActivity));
};

// Filling that in is really the button plugins' job, but I fail to understand
// why that isn't working (I assume it's because the plugins are outdated).
// So, another hacky workaround it is.
const writeSkipIntervalIntoIcons = (player: Paella) => {
    player.containerElement.querySelectorAll(".time-text").forEach(el => {
        el.textContent = String(SKIP_INTERVAL);
    });
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
            crossOrigin: CONFIG.auth.authStaticFiles ? "anonymous" : false,
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
        "es.upv.paella.currentTimeLabel": {
            enabled: true,
            textSize: "large",
            showTotalTime: true,
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
            // Non-responsive (everything here is static), but it's the best we can
            // do in this context.
            ...window.innerWidth < BREAKPOINT_SMALL && { parentContainer: "optionsContainer" },
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
