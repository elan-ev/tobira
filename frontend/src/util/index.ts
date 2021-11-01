import { MutableRefObject, useEffect } from "react";
import { useTranslation } from "react-i18next";
import CONFIG, { TranslatedString } from "../config";

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
 * Sets the HTML title to the given string (plus base title) on mount, resets
 * it on unmount.
 */
export const useTitle = (title: string, noSuffix = false): void => {
    const siteTitle = useTranslatedConfig(CONFIG.siteTitle);
    useEffect(() => {
        document.title = noSuffix ? title : `${title} • ${siteTitle}`;

        // On unmount, we set the title to the base title.
        return () => {
            document.title = siteTitle;
        };
    });
};

/** Extracts the string corresponding to the current language from a translated config string. */
export const useTranslatedConfig = (s: TranslatedString): string => {
    const { i18n } = useTranslation();
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
