import { PropsWithChildren, useEffect } from "react";
import { useBeforeunload } from "react-beforeunload";
import { useTranslation } from "react-i18next";
import { match } from "@opencast/appkit";

import { Link, useRouter } from "../router";
import CONFIG from "../config";
import { LoginRoute, REDIRECT_STORAGE_KEY } from "./Login";
import { AclArray } from "./Upload";
import { RealmOrder } from "../layout/__generated__/NavigationData.graphql";
import { NoteWithTooltip } from "../ui";


export const b64regex = "[a-zA-Z0-9\\-_]";


/** Shows an italic "Missing name", intended for use whenever there is no realm name. */
export const MissingRealmName: React.FC = () => {
    const { t } = useTranslation();
    return <i>{t("realm.missing-name")}</i>;
};

type RealmSortOrder = RealmOrder;

/**
 * Returns a sorted version of the given realms according to `sortOrder`. It is
 * only sorted for `ALPHABETIC*` values of `sortOrder`. For `BY_INDEX`, the
 * original array is returned as it is assumed it is already ordered by index.
 */
export const sortRealms = <T extends { readonly name?: string | null }>(
    realms: readonly T[],
    sortOrder: RealmSortOrder,
    language: string,
): readonly T[] => {
    const collator = new Intl.Collator(language);
    const compare = (a?: string | null, b?: string | null) => {
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
    }) ?? realms;
};


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

type LoginLinkProps = PropsWithChildren & {
    className?: string;
}

export const LoginLink: React.FC<LoginLinkProps> = ({ className, children }) => (
    <Link
        to={CONFIG.auth.loginLink ?? LoginRoute.url}
        onClick={() => {
            // Store a redirect link in session storage.
            window.sessionStorage.setItem(REDIRECT_STORAGE_KEY, window.location.href);
        }}
        htmlLink={!!CONFIG.auth.loginLink}
        {...{ className }}
    >{children}</Link>
);

export const mapAcl = (acl?: AclArray) => new Map(
    acl?.map(item => [item.role, {
        actions: new Set(item.actions),
        info: item.info,
    }]),
);

export const NotReadyNote: React.FC<{ kind: "series" | "video"}> = ({ kind }) => {
    const { t } = useTranslation();

    return <NoteWithTooltip
        note={t(`${kind}.not-ready.title`)}
        tooltip={t(`${kind}.not-ready.text`)}
    />;
};
