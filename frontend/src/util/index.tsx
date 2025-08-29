import { i18n } from "i18next";
import { MutableRefObject, PropsWithChildren, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { bug, match, useColorScheme } from "@opencast/appkit";
import { css } from "@emotion/react";

import CONFIG, { TranslatedString } from "../config";
import { TimeUnit } from "../ui/Input";
import { CREDENTIALS_STORAGE_KEY } from "../routes/Video";
import { COLORS } from "../color";
import { Caption } from "../ui/player";
import translator from "../i18n";


/**
 * Retrieves the key of an ID by stripping the "kind" prefix. If a key
 * (already without "kind" prefix) is passed as argument, it is returned
 * untouched. If the argument has the wrong length, meaning it's neither an ID
 * nor a key, this panics.
 */
export function keyOfId(id: string): string {
    return match(id.length, {
        13: () => id.substring(2),
        11: () => id,
    }) ?? bug("argument of `keyOfId` is neither a key nor an ID");
}

/** Constructs event ID for graphQL by adding the "ev" prefix. */
export const eventId = (key: string) => `ev${key}`;

/** Constructs series ID for graphQL by adding the "sr" prefix. */
export const seriesId = (key: string) => `sr${key}`;

/** Constructs series ID for graphQL by adding the "sr" prefix. */
export const playlistId = (key: string) => `pl${key}`;

/**
 * Create a comparison function for `Array.prototype.sort` comparing whatever
 * the given key function returns as numbers.
 */
export function compareByKey<T>(key: (item: T) => number): (itemA: T, itemB: T) => number {
    return (itemA, itemB) => key(itemB) - key(itemA);
}

/** Swap a binary function's arguments. Useful for example for comparison functions. */
export function swap<T, U, R>(f: (x: T, y: U) => R): (y: U, x: T) => R {
    return (y, x) => f(x, y);
}

/**
 * A safe way to make a character class matching regexp out of a string of characters.
 * Note that characters that have a meaning inside of a character class are unconditionally escaped,
 * i.e. `characterClass("a-z")` might not do what you think it does!
 */
export function characterClass(characters: string): string {
    characters = characters.replace(
        /[\\\]^-]/gu,
        specialChar => `\\${specialChar}`,
    );
    return `[${characters}]`;
}

/**
 * Sets the HTML title to the given string (plus base title) on mount, resets
 * it on unmount. If the given title is `null`, does not do anything on mount.
 */
export const useTitle = (title?: string | null, noSuffix = false): void => {
    const siteTitle = useTranslatedConfig(CONFIG.siteTitle);
    useEffect(() => {
        if (title != null) {
            document.title = noSuffix ? title : `${title} • ${siteTitle}`;
        }

        // On unmount, we set the title to the base title.
        return () => {
            document.title = siteTitle;
        };
    });
};

/** Extracts the string corresponding to the current language from a translated config string. */
export const useTranslatedConfig = (s: TranslatedString): string => {
    const { i18n } = useTranslation();
    return translatedConfig(s, i18n);
};

/** Extracts the string corresponding to `i18n.resolvedLanguage` from a translated config string. */
export const translatedConfig = (s: TranslatedString, i18n: i18n): string =>
    getTranslatedString(s, i18n.resolvedLanguage);

export const getTranslatedString = (s: TranslatedString, lang: string | undefined): string => {
    const l = lang ?? "default";
    return (l in s ? s[l as keyof TranslatedString] : undefined) ?? s.default;
};

export const useOnOutsideClick = (
    ref: MutableRefObject<Node | null>,
    callback: () => void,
): void => {
    useEffect(() => {
        const handler = (event: MouseEvent) => {
            const target = event.target;
            if (ref.current && target instanceof Element && !ref.current.contains(target)) {
                callback();
            }
        };

        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    });
};

/** Helper hook returning a function that, when called, forces a rerender of the component. */
export const useForceRerender = (): () => void => {
    const setState = useState({})[1];
    return () => setState({});
};

/**
 * Like `useState`, but also returns a ref object containing that state. This is
 * useful if the current state needs to be accessed from callbacks that were
 * created when the state had a different value.
 */
export const useRefState = <T, >(
    initialValue: T,
): [MutableRefObject<T>, (newValue: T) => void] => {
    const forceRerender = useForceRerender();
    const ref = useRef<T>(initialValue);
    const update = (newValue: T) => {
        ref.current = newValue;
        forceRerender();
    };

    return [ref, update];
};

/**
 * Accesses the current value of a ref, signaling an error when it is unbound.
 * Note: **Don't** use this if you expect the ref to be unbound temporarily.
 * This is mainly for accessing refs in event handlers for elements
 * that are guaranteed to be alive as long as the ref itself.
 */
export const currentRef = <T, >(ref: React.RefObject<T>): T => (
    ref.current ?? bug("ref unexpectedly unbound")
);


// Some utilities to handle the different lifecycle stages of events and series
export type OpencastEntity = {
    syncedData: unknown
} | {
    state: "WAITING" | "READY" | "%future added value"
};

export type SyncedOpencastEntity<T extends OpencastEntity> = "syncedData" extends keyof T
    ? (T & { syncedData: NonNullable<T["syncedData"]> })
    : ("state" extends keyof T
        ? (T & { state: Extract<T["state"], "READY"> })
        : never
    );

export const isSynced = <T extends OpencastEntity>(
    e: T,
): e is SyncedOpencastEntity<T> => {
    if ("syncedData" in e) {
        return Boolean(e.syncedData);
    }
    if ("state" in e) {
        return e.state === "READY";
    }
    return false;
};

/**
 * Adds `<meta name="robots" content="noindex">` to the document `<head>` and
 * removes it when the calling component gets unmounted. Does nothing if
 * `false` is passed as argument.
 */
export const useNoindexTag = (noindex = true) => {
    useEffect(() => {
        if (!noindex) {
            return () => {};
        }

        const tag = document.createElement("meta");
        tag.setAttribute("name", "robots");
        tag.setAttribute("content", "noindex");
        document.head.appendChild(tag);

        return () => {
            document.head.removeChild(tag);
        };
    });
};

/** Formats the given number of milliseconds as ISO 8601 duration string, e.g. "PT3M47S" */
export const toIsoDuration = (milliseconds: number): string => {
    let acc = Math.floor(milliseconds / 1000);
    const seconds = acc % 60;
    acc = Math.floor(acc / 60);
    const minutes = acc % 60;
    acc = Math.floor(acc / 60);
    const hours = acc;

    return `PT${hours}H${minutes}M${seconds}S`;
};

export const isExperimentalFlagSet = () => (
    window.localStorage.getItem("tobiraExperimentalFeatures") === "true"
);

/**
 * Converts a time string used in URL params like "01h30m49s" to seconds.
 */
export const timeStringToSeconds = (timeString: string): number => {
    const timeSplit = /((\d+)h)?((\d+)m)?((\d+)s)?/.exec(timeString);
    const hours = timeSplit && timeSplit[2] ? parseInt(timeSplit[2]) * 60 * 60 : 0;
    const minutes = timeSplit && timeSplit[4] ? parseInt(timeSplit[4]) * 60 : 0;
    const seconds = timeSplit && timeSplit[6] ? parseInt(timeSplit[6]) : 0;

    return hours + minutes + seconds;
};

/**
 * Formats the given number of seconds as string containing hours, minutes and seconds,
 * e.g. "0h2m4s".
 */
export const secondsToTimeString = (seconds: number): string => {
    const formatTime = (time: number, unit: TimeUnit): string =>
        time > 0 ? time.toString().padStart(2, "0") + unit : "";

    const hours = formatTime(Math.floor(seconds / 3600), "h");
    const minutes = formatTime(Math.floor((seconds % 3600) / 60), "m");
    const remainingSeconds = formatTime(Math.floor(seconds % 60), "s");

    return hours + minutes + remainingSeconds;
};

export type ExtraMetadata = Record<string, Record<string, string[]>>;

export type Credentials = {
    user: string;
    password: string;
} | null;


/**
 * Returns stored credentials of events.
 *
 * Three kinds of IDs are stored when a user authenticates for an event:
 * We need to store both Tobira ID and Opencast ID, since the video route can be accessed
 * via both kinds. For this, both IDs are queried from the DB.
 * The check for already stored credentials however happens in the same query,
 * so we only have access to the single event ID from the url.
 * In order to have a successful check when visiting a video page with either Tobira ID
 * or Opencast ID in the url, this check accepts both ID kinds.
 * Lastly, we also store the series ID of an event. If other events of that series use
 * the same credentials, authenticating for the current event will also unlock
 * these other events.
 */
type IdKind = "event" | "oc-event" | "series";
export const getCredentials = (kind: IdKind, id: string): Credentials => {
    const credentials = window.localStorage.getItem(credentialsStorageKey(kind, id))
        ?? window.sessionStorage.getItem(credentialsStorageKey(kind, id));

    if (!credentials) {
        return null;
    }

    const parsed = JSON.parse(credentials) as unknown;
    if (parsed && typeof parsed === "object"
        && "user" in parsed && typeof parsed.user === "string"
        && "password" in parsed && typeof parsed.password === "string") {
        return {
            user: parsed.user,
            password: parsed.password,
        };
    } else {
        return null;
    }
};

export const credentialsStorageKey = (kind: IdKind, id: string) =>
    CREDENTIALS_STORAGE_KEY + kind + "-" + id;

export const useLogoConfig = () => {
    const { i18n } = useTranslation();
    const mode = useColorScheme().scheme;
    const lang = i18n.resolvedLanguage;
    const logos = CONFIG.logos;

    const findLogo = (size: "wide" | "narrow") => {
        const list = logos
            .filter(l => l.size === size || !l.size)
            .filter(l => l.mode === mode || !l.mode);

        return list.find(l => l.lang === lang) || list.find(l => !l.lang || l.lang === "default");
    };

    const wide = findLogo("wide");
    const narrow = findLogo("narrow");

    if (!wide || !narrow) {
        // Shouldn't happen™, but helps with type safety.
        bug("missing logos in configuration");
    }

    return { wide, narrow };
};

export const visuallyHiddenStyle = css({
    clipPath: "inset(50%)",
    height: 1,
    overflow: "hidden",
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
});

type InertableProps = PropsWithChildren<{
    isInert: boolean;
    className?: string;
}>

/** Can be used to conditionally disable and grey out control elements. */
export const Inertable: React.FC<InertableProps> = ({ children, isInert, className }) => (
    <div {...{ className }} {...isInert && { inert: "true", css: { opacity: 0.7 } }}>
        {children}
    </div>
);

export type OcEntity = "series" | "video";

export const floatingMenuProps = (isDark: boolean) => ({
    padding: 0,
    borderWidth: isDark ? 1 : 0,
    backgroundColor: isDark ? COLORS.neutral15 : COLORS.neutral05,
}) as const;


type CaptionTextProps = {
    lang?: string;
    index: number;
    captions: readonly Caption[];
};

// We try to come up with usable labels for the tracks. This should be
// improved in the future, hopefully by getting better information.
export const captionsText = ({ lang, index, captions } : CaptionTextProps) => {
    // We add numbers to the labels if there would otherwise be two same labels.
    const captionNumbering = captions.length
        !== new Set(captions.map(({ lang }) => lang ?? null)).size;

    const langText = lang ? ` (${lang})` : "";
    const numberingText = captionNumbering ? ` [${index + 1}]` : "";

    return translator.t("video.caption") + langText + numberingText;
};
