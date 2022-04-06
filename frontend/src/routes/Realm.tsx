import React from "react";

import { graphql, loadQuery } from "react-relay/hooks";
import type { RealmQuery, RealmQuery$data } from "./__generated__/RealmQuery.graphql";
import { useTranslation } from "react-i18next";
import { FiLayout, FiPlus, FiTool } from "react-icons/fi";

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
    const urlPath = decodeURIComponent(url.pathname).replace(/^\//, "").replace(/\/$/, "");
    if (urlPath !== "") {
        for (const segment of urlPath.split("/")) {
            if (!isValidPathSegment(segment)) {
                return null;
            }
        }
    }

    const realmPath = "/" + urlPath;

    const path = realmPath === "" ? "/" : realmPath;
    const queryRef = loadQuery<RealmQuery>(relayEnv, query, { path });

    return {
        render: () => <RootLoader
            {...{ query, queryRef }}
            nav={data => {
                if (!data.realm) {
                    return [];
                }

                const mainNav = <Nav key="nav" fragRef={data.realm} />;
                return data.realm.canCurrentUserEdit
                    ? [mainNav, <RealmEditLinks key="edit-buttons" path={path} />]
                    : mainNav;
            }}
            render={data => (
                data.realm
                    ? <RealmPage {...{ path, realm: data.realm }} />
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
    const siteTitle = useTranslatedConfig(CONFIG.siteTitle);
    const breadcrumbs = realm.ancestors.map(({ name, path }) => ({ label: name, link: path }));

    const isRoot = realm.parent === null;
    const title = isRoot ? siteTitle : realm.name;
    useTitle(title, isRoot);

    return <>
        {!isRoot && <Breadcrumbs path={breadcrumbs} tail={realm.name} />}
        {title && <h1>{title}</h1>}
        <Blocks realm={realm} />
    </>;
};

export const RealmEditLinks: React.FC<{ path: string }> = ({ path }) => {
    const { t } = useTranslation();

    const encodedPath = pathToQuery(path);

    const items = [
        <LinkWithIcon key={0} to={`/~manage/realm?path=${encodedPath}`} iconPos="left">
            <FiTool />
            {t("realm.page-settings")}
        </LinkWithIcon>,
        <LinkWithIcon key={1} to={`/~manage/realm/content?path=${encodedPath}`} iconPos="left">
            <FiLayout />
            {t("realm.edit-page-content")}
        </LinkWithIcon>,
        <LinkWithIcon key={1} to={`/~manage/realm/add-child?parent=${encodedPath}`} iconPos="left">
            <FiPlus />
            {t("realm.add-sub-page")}
        </LinkWithIcon>,
    ];

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
