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
    siteTitle: string;
    logo: LogoConfig;
    plyr: PlyrConfig;
    theme: ThemeConfig;
};

type AuthConfig = {
    loginLink: string | null;
};

type LogoConfig = {
    margin: number;
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

type ThemeConfig = {
    headerHeight: number;
    headerPadding: number;
    color: {
        navigation: string;
        accent: string;
        grey50: string;
        danger: string;
        happy: string;
    };
};

const CONFIG: Config = parseConfig();
export default CONFIG;
