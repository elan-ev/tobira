import { i18n } from "i18next";
import { MutableRefObject, useEffect, useRef, useState } from "react";
import { useBeforeunload } from "react-beforeunload";
import { useTranslation } from "react-i18next";
import CONFIG, { TranslatedString } from "../config";
import { useRouter } from "../router";
import { bug } from "./err";

/**
 * A switch-like expression with exhaustiveness check (or fallback value). A bit
 * like Rust's `match`, but worse.
 *
 * If the `fallback` is not given, the given match arms need to be exhaustive.
 * This helps a lot with maintanence as adding a new variant to a union type
 * will throw compile errors in all places that likely need adjustment. You can
 * also pass a fallback (default) value as third parameter, disabling the
 * exhaustiveness check.
 *
 * ```
 * type Animal = "dog" | "cat" | "fox";
 *
 * const animal = "fox" as Animal;
 * const awesomeness = match(animal, {
 *     "dog": () => 7,
 *     "cat": () => 6,
 *     "fox": () => 100,
 * });
 * ```
 */
export function match<T extends string | number, Out>(
    value: T,
    arms: Record<T, () => Out>,
): Out;
export function match<T extends string | number, Out>(
    value: T,
    arms: Partial<Record<T, () => Out>>,
    fallback: () => Out,
): Out;
export function match<T extends string | number, Out>(
    value: T,
    arms: Partial<Record<T, () => Out>>,
    fallback?: () => Out,
): Out {
    return fallback === undefined
        // Unfortunately, we haven't found a way to make the TS typesystem to
        // understand that in the case of `fallback === undefined`, `arms` is
        // not a partial map. But it is, as you can see from the two callable
        // signatures above.
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        ? arms[value]!()
        : (arms[value] as (() => Out) | undefined ?? fallback)();
}

/** Retrieves the key of an ID by stripping the "kind" prefix. */
export function keyOfId(id: string): string {
    return id.substring(2);
}

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
export const useTitle = (title: string | null, noSuffix = false): void => {
    const siteTitle = useTranslatedConfig(CONFIG.siteTitle);
    useEffect(() => {
        if (title !== null) {
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
export const translatedConfig = (s: TranslatedString, i18n: i18n): string => {
    const lang = i18n.resolvedLanguage;
    return (lang in s ? s[lang as keyof TranslatedString] : undefined) ?? s.en;
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
    const [_, setCounter] = useState(0);
    return () => setCounter(old => old + 1);
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
export const currentRef = <T>(ref: React.RefObject<T>): T => (
    ref.current ?? bug("ref unexpectedly unbound")
);

/**
 * Whenever the current route/page is about to be unloaded (due to browser
 * reloads, a tab being closed, or the route being changed), AND when
 * `shouldBlock` or `shouldBlock()` is `true`, then the navigation attempt is
 * blocked. That means that the user is asked whether they really want to
 * leave. The user can still say "yes" and proceed with the navigation.
 */
export const useNavBlocker = (shouldBlock: boolean | (() => boolean)) => {
    const { t } = useTranslation();
    const router = useRouter();

    const shouldBlockImpl = typeof shouldBlock === "boolean"
        ? () => shouldBlock
        : shouldBlock;

    useBeforeunload(event => {
        if (shouldBlockImpl()) {
            event.preventDefault();
        }
    });

    useEffect(() => (
        router.listenBeforeNav(() => (
            shouldBlockImpl() && !window.confirm(t("general.leave-page-confirmation"))
                ? "prevent-nav"
                : undefined
        ))
    ));
};


// Some utilities to handle the different lifecycle stages of events and series
type OpencastEntity = { syncedData: any };
export type SyncedOpencastEntity<T extends OpencastEntity> = T & {
    syncedData: NonNullable<T["syncedData"]>;
};
export const isSynced = <T extends OpencastEntity>(e: T): e is SyncedOpencastEntity<T> => (
    Boolean(e.syncedData)
);

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
    let acc = milliseconds / 1000;
    const seconds = acc % 60;
    acc /= 60;
    const minutes = acc % 60;
    acc /= 60;
    const hours = acc;

    return `PT${hours}H${minutes}M${seconds}S`;
};
