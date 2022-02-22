import { bug } from "./util/err";


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
    auth: AuthConfig;
    siteTitle: TranslatedString;
    ocUrl: string;
    footerLinks: FooterLink[];
    logo: LogoConfig;
    plyr: PlyrConfig;
};

type FooterLink = "about" | "graphiql" | {
    label: TranslatedString;
    link: string;
};

type AuthConfig = {
    loginLink: string | null;
    userIdLabel: TranslatedString | null;
    passwordLabel: TranslatedString | null;
    loginPageNote: TranslatedString | null;
};

type LogoConfig = {
    large: SingleLogoConfig;
    small: SingleLogoConfig;
};

type SingleLogoConfig = {
    path: string;
    resolution: number[];
};

type PlyrConfig = {
    blankVideo: string;
    svg: string;
};

export type TranslatedString = { en: string } & Record<"de", string | undefined>;

const CONFIG: Config = parseConfig();
export default CONFIG;
