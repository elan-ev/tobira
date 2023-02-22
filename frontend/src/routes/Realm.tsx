import React, { ReactElement } from "react";

import { graphql, loadQuery } from "react-relay/hooks";
import type { RealmQuery, RealmQuery$data } from "./__generated__/RealmQuery.graphql";
import { useTranslation } from "react-i18next";
import { FiEdit, FiInfo, FiPlusCircle, FiSettings, FiSunrise } from "react-icons/fi";

import { environment as relayEnv } from "../relay";
import { Breadcrumbs } from "../ui/Breadcrumbs";
import { Blocks } from "../ui/Blocks";
import { RootLoader } from "../layout/Root";
import { NotFound } from "./NotFound";
import { Nav } from "../layout/Navigation";
import { LinkList, LinkWithIcon } from "../ui";
import CONFIG from "../config";
import { characterClass, useTitle, useTranslatedConfig } from "../util";
import { makeRoute } from "../rauta";
import { MissingRealmName } from "./util";
import { realmBreadcrumbs } from "../util/realm";
import { WithTooltip } from "../ui/Floating";


// eslint-disable-next-line @typescript-eslint/quotes
export const ILLEGAL_CHARS = '<>"[\\]^`{|}#%/?';
export const RESERVED_CHARS = "-+~@_!$&;:.,=*'()";

export type PathSegmentValidity = "valid"
| "too-short"
| "control-char"
| "whitespace"
| "illegal-chars"
| "reserved-chars-at-beginning";

export const checkPathSegment = (segment: string): PathSegmentValidity => {
    if ((new TextEncoder().encode(segment)).length <= 1) {
        return "too-short";
    }
    // eslint-disable-next-line no-control-regex
    if (segment.match(/[\u0000-\u001F\u007F-\u009F]/u)) {
        return "control-char";
    }
    if (segment.match(/[\u0020\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/u)) {
        return "whitespace";
    }
    if (segment.match(new RegExp(characterClass(ILLEGAL_CHARS), "u"))) {
        return "illegal-chars";
    }
    if (segment.match(new RegExp(`^${characterClass(RESERVED_CHARS)}`, "u"))) {
        return "reserved-chars-at-beginning";
    }

    return "valid";
};

export const isValidPathSegment = (segment: string): boolean =>
    checkPathSegment(segment) === "valid";

export const RealmRoute = makeRoute(url => {
    const urlPath = url.pathname.replace(/^\/|\/$/g, "");
    const pathSegments = urlPath.split("/").map(decodeURIComponent);
    if (urlPath !== "") {
        for (const [i, segment] of pathSegments.entries()) {
            const isValid = isValidPathSegment(segment)
                || (i === 0 && segment.startsWith("@") && isValidPathSegment(segment.substring(1)));
            if (!isValid) {
                return null;
            }
        }
    }

    const realmPath = "/" + pathSegments.join("/");

    const queryRef = loadQuery<RealmQuery>(relayEnv, query, { path: realmPath });

    return {
        render: () => <RootLoader
            {...{ query, queryRef }}
            nav={data => {
                if (!data.realm) {
                    return [];
                }

                const mainNav = <Nav key="nav" fragRef={data.realm} />;
                return data.realm.canCurrentUserEdit
                    ? [mainNav, <RealmEditLinks key="edit-buttons" path={realmPath} />]
                    : mainNav;
            }}
            render={data => (
                data.realm
                    ? <RealmPage realm={data.realm} />
                    : <NotFound kind="page" />
            )}
        />,
        dispose: () => queryRef.dispose(),
    };
});

const query = graphql`
    query RealmQuery($path: String!) {
        ... UserData
        realm: realmByPath(path: $path) {
            id
            name
            path
            isMainRoot
            isUserRealm
            children { id }
            blocks { id }
            canCurrentUserEdit
            ancestors { name path }
            parent { id }
            ... BlocksData
            ... NavigationData
        }
    }
`;

type Props = {
    realm: NonNullable<RealmQuery$data["realm"]>;
};

const RealmPage: React.FC<Props> = ({ realm }) => {
    const { t } = useTranslation();
    const siteTitle = useTranslatedConfig(CONFIG.siteTitle);
    const breadcrumbs = realmBreadcrumbs(t, realm.ancestors);

    const title = realm.isMainRoot ? siteTitle : realm.name;
    useTitle(title, realm.isMainRoot);

    return <>
        {!realm.isMainRoot && (
            <Breadcrumbs path={breadcrumbs} tail={realm.name ?? <MissingRealmName />} />
        )}
        {title && <div>
            <h1 css={{ display: "inline-block" }}>{title}</h1>
            {realm.isUserRealm && <UserRealmNote realm={realm} />}
        </div>}
        {realm.blocks.length === 0 && realm.isMainRoot
            ? <WelcomeMessage />
            : <Blocks realm={realm} />}
    </>;
};

const WelcomeMessage: React.FC = () => {
    const { t } = useTranslation();

    return (
        <div css={{
            maxWidth: 500,
            marginTop: 32,
            display: "inline-flex",
            flexDirection: "column",
            borderRadius: 4,
            padding: "8px 16px",
            gap: 16,
            alignItems: "center",
            backgroundColor: "var(--grey97)",
            border: "2px dashed var(--happy-color)",
        }}>
            <FiSunrise css={{ marginTop: 8, fontSize: 32, minWidth: 32 }} />
            <div>
                <h2 css={{ textAlign: "center", fontSize: 20, marginBottom: 16 }}>
                    {t("welcome.title")}
                </h2>
                <p>{t("welcome.body")}</p>
            </div>
        </div>
    );
};

const UserRealmNote: React.FC<Props> = ({ realm }) => {
    const { t } = useTranslation();
    const displayName = realm.ancestors.concat(realm)[0].name;

    return (
        <WithTooltip
            tooltip={t("realm.user-realm.note-body", { user: displayName })}
            placement="bottom"
            tooltipCss={{ width: 400 }}
            css={{ display: "inline-block", marginLeft: 12 }}
        >
            <div css={{
                fontSize: 14,
                lineHeight: 1,
                color: "var(--grey40)",
                display: "flex",
                gap: 4,
            }}>
                <FiInfo />
                {t("realm.user-realm.note-label")}
            </div>
        </WithTooltip>

    );
};

export const RealmEditLinks: React.FC<{ path: string }> = ({ path }) => {
    const { t } = useTranslation();

    /* eslint-disable react/jsx-key */
    const buttons: [string, string, ReactElement][] = [
        ["/~manage/realm?path=", t("realm.page-settings"), <FiSettings />],
        ["/~manage/realm/content?path=", t("realm.edit-page-content"), <FiEdit />],
        ["/~manage/realm/add-child?parent=", t("realm.add-sub-page"), <FiPlusCircle />],
    ];
    /* eslint-enable react/jsx-key */

    const isActive = (route: string) => document.location.href.includes(route);

    const encodedPath = pathToQuery(path);

    const items = buttons.map(([route, label, icon], i) => (
        <LinkWithIcon key={i}
            to={`${route}${encodedPath}`}
            iconPos="left"
            active={isActive(route)}
        >
            {icon}
            {label}
        </LinkWithIcon>
    ));

    return <LinkList items={items} />;
};

/**
 * Formats a realm path for inclusion in a query parameter.
 * Specifically, it preserves the path separators (`/`) between the
 * individual path segments for better readability.
 * It is thus **not** suited for use in the path-part of a URL!
 */
export const pathToQuery = (path: string): string => (
    encodeURIComponent(path).replace(/%2f/gui, "/")
);
