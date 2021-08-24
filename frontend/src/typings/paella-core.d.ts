declare module "paella-core" {
    export class Paella {
        public constructor(node: string | HTMLElement, initParams: InitParams);

        public loadManifest(): Promise<void>;
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

        customPluginContext?: unknown[];
    }

    export type Config = Record<string, unknown>;

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

