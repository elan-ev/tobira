import { bug } from "@opencast/appkit";


/** The ID of the HTML element containing our configuration. */
const ID = "tobira-frontend-config";

/** Loads the frontend config and returns it as object. */
const parseConfig: () => Config = () => {
    const tag = document.getElementById(ID);
    if (tag === null) {
        return bug(`No <script> tag with ID '${ID}' in HTML: cannot load frontend config`);
    }
    if (!(tag instanceof HTMLScriptElement)) {
        return bug(`Element with ID '${ID}' is not a <script> tag: cannot load frontend config`);
    }

    // We just cast the parsed type without checking. We might want to add a
    // check later, but it's not that important because this value is completely
    // controlled by us.
    return JSON.parse(tag.text) as Config;
};

type Config = {
    version: VersionInfo;
    auth: AuthConfig;
    siteTitle: TranslatedString;
    initialConsent: InitialConsent | null;
    showDownloadButton: boolean;
    usersSearchable: boolean;
    lockAclToSeries: boolean;
    globalBanner: null | {
        text: TranslatedString,
        color: "neutral" | "primary" | "danger",
        icon: "warning" | "info",
    },
    behavior: {
        disallowEventsWithoutSeries: boolean;
    };
    opencast: OpencastConfig;
    footerLinks: FooterLink[];
    footerMarkdown: TranslatedString | null;
    metadataLabels: Record<string, Record<string, MetadataLabel>>;
    paellaSettingsIcon: string;
    paellaThemeJson: string;
    logos: LogoConfig;
    favicon: string;
    plyr: PlyrConfig;
    upload: UploadConfig;
    paellaPluginConfig: object;
    sync: SyncConfig;
};

type FooterLink = "about" | "graphiql" | {
    label: TranslatedString;
    link: TranslatedString | string;
};

type InitialConsent = {
    title: TranslatedString;
    button: TranslatedString;
    text: TranslatedString;
}

type AuthConfig = {
    usesTobiraSessions: boolean;
    hideLoginButton: boolean;
    loginLink: string | null;
    logoutLink: string | null;
    userIdLabel: TranslatedString | null;
    passwordLabel: TranslatedString | null;
    loginPageNote: TranslatedString | null;
    preAuthExternalLinks: boolean;
    userRolePrefixes: string[];
    globalPageAdminRole: string;
    globalPageModeratorRole: string;
    authStaticFiles: boolean;
};

type LogoConfig = {
    size: "wide" | "narrow"| null;
    mode: "light" | "dark"| null;
    lang: string | null;
    path: string;
    resolution: number[];
}[];

type PlyrConfig = {
    blankVideo: string;
    svg: string;
};

type OpencastConfig = {
    presentationNode: string;
    uploadNode: string;
    studioUrl: string;
    editorUrl: string;
};

type VersionInfo = {
    identifier: string;
    buildDateUtc: string;
    gitCommitHash: string;
    gitWasDirty: boolean;
    target: string;
};

type UploadConfig = {
    workflow: string | null;
    thumbnailSubtype: string,
    thumbnailWorkflowProperty: string,
};

type SyncConfig = {
    pollPeriod: number;
};

type MetadataLabel = "builtin:license" | "builtin:source" | TranslatedString;

export type TranslatedString = { default: string } & Record<"en" | "de", string | undefined>;

const CONFIG: Config = parseConfig();
export default CONFIG;
