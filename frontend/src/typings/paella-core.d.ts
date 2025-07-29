declare module "paella-core" {
    export class Paella {
        /**
         * Creates a new `Paella` instance.
         *
         * `node` is either an `HTMLElement` of the container that Paella should
         * live in, or the string ID of said container.
         */
        public constructor(node: string | HTMLElement, initParams: InitParams);

        /**
         * Loads the configuration and manifest according to `initParams` passed
         * to the constructor.
         */
        public loadManifest(): Promise<void>;

        public videoContainer: VideoContainer;

        public bindEvent(
            event: string,
            callback: () => void,
            unregisterOnUnload?: boolean
        ): () => void;

        public setLanguage(lang: string): void;
        public addDictionary(lang: string, dict: Record<string, string>): void;

        public skin: Skin;

        public unload(): Promise<void>;

        public isFullscreen: boolean;
        public enterFullscreen(): Promise<void>;
        public exitFullscreen(): Promise<void>;

        public captionsCanvas: CaptionsCanvas;
    }

    export interface InitParams {
        configResourcesUrl?: string;
        configUrl?: string;
        repositoryUrl?: string;
        manifestFileName?: string;

        loadConfig?: (configUrl: string) => Promise<Config>;
        getVideoId?: () => Promise<string>;
        getManifestUrl?: (repoUrl: string, videoId: string) => Promise<string>;
        getManifestFileUrl?: (manifestUrl: string, manifestFileName: string) => Promise<string>;
        loadVideoManifest?: (manifestUrl: string) => Promise<Manifest>;
        loadDictionaries?: (player: Paella) => void;

        customPluginContext?: PluginContext[];
    }

    export interface Config {
        /** Is passed to `InitParams.getManifestUrl`. Default: empty string. */
        repositoryUrl?: string;

        /** Is passed to `InitParams.getManifestFileUrl`. Default: empty string. */
        manifestFileName?: string;

        // TODO: what exactly does this do?
        defaultLayout?: string;

        /**
         * Language paella defaults to if there is no translation file corresponding
         * to the current browser language or Tobira's currently set language.
         */
        defaultLanguage?: string;

        logLevel?: "DISABLED" | "ERROR" | "WARN" | "INFO" | "DEBUG" | "VERBOSE";
        plugins: Record<string, PluginConfig>;
    }

    export interface Skin {
        loadSkin: (url: string) => Promise<void>;
    }

    export interface VideoContainer {
        lastVolume: number;

        setCurrentTime: (t: number) => Promise<void>;
        currentTime: () => Promise<number>;
        pause: () => Promise<void>;
        play: () => Promise<void>;
        paused: () => Promise<boolean>;
        volume: () => Promise<number>;
        setVolume: (volume: number) => Promise<void>;
        playbackRate: () => Promise<number>;
        setPlaybackRate: (rate: number) => Promise<void>;
    }

    interface CaptionsCanvas {
        isVisible: boolean;
        captions: Caption[];
        disableCaptions: () => void;
        enableCaptions: (searchOptions: { label?: string; index?: number; lang?: string }) => void;
    }

    export type PluginConfig = Record<string, unknown> & {
        enabled: boolean;
    };

    export type PluginContext = __WebpackModuleApi.RequireContext;

    // Definition: https://github.com/polimediaupv/paella-core/blob/main/doc/video_manifest.md
    export interface Manifest {
        // https://github.com/polimediaupv/paella-core/blob/main/doc/video_manifest.md#metadata
        metadata: {
            duration: number;
            title?: string;
            preview?: string | null;
            // TODO: `related`
        } & Record<string, unknown>;

        streams: Stream[];

        captions: Caption[];

        frameList: Frame[];
    }

    // https://github.com/polimediaupv/paella-core/blob/main/doc/video_manifest.md#frame-list
    export interface Frame {
        id: string;
        mimetype: "image/jpeg";
        time: number;
        url: string;
        thumb: string;
    }

    export interface Stream {
        content: string;
        role?: "mainAudio";
        sources: {
            mp4?: Source[];
            hls?: Source[];
            hlsLive?: Source[];
        };
        // TODO: `role`
    }

    // https://github.com/polimediaupv/paella-core/blob/main/doc/video_manifest.md#captions
    export interface Caption {
        format: "vtt";
        url: string;
        lang?: string;
        text?: string;
    }

    // https://github.com/polimediaupv/paella-core/blob/main/doc/mp4_video_plugin.md
    // https://github.com/polimediaupv/paella-core/blob/main/doc/hls_video_plugin.md
    // https://github.com/polimediaupv/paella-core/blob/main/doc/hls_live_video_plugin.md
    export interface Source {
        src: string;
        // Currently unused...
        mimetype: "video/mp4";
        res: {
            w: number;
            h: number;
        };
    }
}

