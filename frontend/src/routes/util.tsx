import { useTranslation } from "react-i18next";
import { match } from "../util";


export const b64regex = "[a-zA-Z0-9\\-_]";


/** Shows an italic "Missing name", intended for use whenever there is no realm name. */
export const MissingRealmName: React.FC = () => {
    const { t } = useTranslation();
    return <i>{t("realm.missing-name")}</i>;
};

type RealmSortOrder = "ALPHABETIC_ASC" | "ALPHABETIC_DESC" | "BY_INDEX" | string;

/**
 * Returns a sorted version of the given realms according to `sortOrder`. It is
 * only sorted for `ALPHABETIC*` values of `sortOrder`. For `BY_INDEX`, the
 * original array is returned as it is assumed it is already ordered by index.
 */
export const sortRealms = <T extends { readonly name: string | null }>(
    realms: readonly T[],
    sortOrder: RealmSortOrder,
    language: string,
): readonly T[] => {
    const collator = new Intl.Collator(language);
    const compare = (a: string | null, b: string | null) => {
        if (a == null && b == null) {
            return 0;
        }
        if (a == null) {
            return 1;
        }
        if (b == null) {
            return -1;
        }
        return collator.compare(a, b);
    };

    return match(sortOrder, {
        "ALPHABETIC_ASC": () => [...realms].sort((a, b) => compare(a.name, b.name)),
        "ALPHABETIC_DESC": () => [...realms].sort((a, b) => compare(b.name, a.name)),
    }, () => realms);
};
