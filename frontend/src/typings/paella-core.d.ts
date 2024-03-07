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

        public skin: Skin;

        public unload(): Promise<void>;
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

        customPluginContext?: PluginContext[];
    }

    export interface Config {
        /** Is passed to `InitParams.getManifestUrl`. Default: empty string. */
        repositoryUrl?: string;

        /** Is passed to `InitParams.getManifestFileUrl`. Default: empty string. */
        manifestFileName?: string;

        // TODO: what exactly does this do?
        defaultLayout?: string;

        logLevel?: "DISABLED" | "ERROR" | "WARN" | "INFO" | "DEBUG" | "VERBOSE";
        plugins: Record<string, PluginConfig>;
    }

    export interface Skin {
        loadSkin: (url: string) => Promise<void>;
    }

    export interface VideoContainer {
        setCurrentTime: (t: number) => Promise<void>;
        currentTime: () => Promise<number>;
        pause: () => void;
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

        // TODO: `frameList`
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

