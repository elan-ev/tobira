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
            preview?: string;
            // TODO: `related`
        };

        streams: {
            content: string;
            sources: {
                mp4?: Mp4Source[];
            };
            // TODO: `role`
        }[];

        // TODO: `frameList`
        // TODO: `captions`
    }

    // https://github.com/polimediaupv/paella-core/blob/main/doc/mp4-video-plugin.md
    export interface Mp4Source {
        src: string;
        mimetype: "video/mp4";
        res: {
            w: number;
            h: number;
        };
    }
}

