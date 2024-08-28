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
    opencast: OpencastConfig;
    footerLinks: FooterLink[];
    metadataLabels: Record<string, Record<string, MetadataLabel>>;
    logo: LogoConfig;
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
    loginLink: string | null;
    logoutLink: string | null;
    userIdLabel: TranslatedString | null;
    passwordLabel: TranslatedString | null;
    loginPageNote: TranslatedString | null;
    preAuthExternalLinks: boolean;
    userRolePrefixes: string[];
    globalPageAdminRole: string;
    globalPageModeratorRole: string;
};

type LogoConfig = {
    large: SingleLogoConfig;
    small: SingleLogoConfig | null;
    largeDark: SingleLogoConfig | null;
    smallDark: SingleLogoConfig | null;
};

type SingleLogoConfig = {
    path: string;
    resolution: number[];
};

type PlyrConfig = {
    blankVideo: string;
    svg: string;
};

type OpencastConfig = {
    presentationNode: string;
    uploadNode: string;
    studioUrl: string;
    editorUrl: string;
    editorReturnLabel: TranslatedString | null;
};

type VersionInfo = {
    identifier: string;
    buildDateUtc: string;
    gitCommitHash: string;
    gitWasDirty: boolean;
    target: string;
};

type UploadConfig = {
    requireSeries: boolean;
};

type SyncConfig = {
    pollPeriod: number;
};

type MetadataLabel = "builtin:license" | "builtin:source" | TranslatedString;

export type TranslatedString = { en: string } & Record<"de", string | undefined>;

const CONFIG: Config = parseConfig();
export default CONFIG;
