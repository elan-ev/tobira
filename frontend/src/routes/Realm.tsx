import React from "react";

import { graphql, loadQuery } from "react-relay/hooks";
import type { PreloadedQuery } from "react-relay/hooks";
import type { RealmQuery, RealmQueryResponse } from "./__generated__/RealmQuery.graphql";
import { useTranslation } from "react-i18next";
import { FiLayout, FiPlus, FiTool } from "react-icons/fi";

import { environment as relayEnv } from "../relay";
import { Breadcrumbs } from "../ui/Breadcrumbs";
import { Blocks } from "../ui/Blocks";
import { Root } from "../layout/Root";
import { NotFound } from "./NotFound";
import { Nav } from "../layout/Navigation";
import { LinkList, LinkWithIcon } from "../ui";
import CONFIG from "../config";
import { useTitle, useTranslatedConfig } from "../util";
import { makeRoute } from "../rauta";
import { UserData$key } from "../__generated__/UserData.graphql";
import { QueryLoader } from "../util/QueryLoader";

/** A valid realm path segment */
export const PATH_SEGMENT_REGEX = "[\\p{Alphabetic}\\d][\\p{Alphabetic}\\d\\-]+";

export const RealmRoute = makeRoute<[PreloadedQuery<RealmQuery>, string]>({
    path: `((?:/${PATH_SEGMENT_REGEX})*)`,
    queryParams: [],
    prepare: ({ pathParams: [realmPath] }) => {
        const path = realmPath === "" ? "/" : realmPath;
        return [loadQuery(relayEnv, query, { path }), path];
    },
    render: ([queryRef, path]) => <QueryLoader {...{ query, queryRef }} render={result => (
        !result.realm
            ? <NotFound kind="page" />
            : <RealmPage {...{ userQuery: result, path, realm: result.realm }} />
    )} />,
    dispose: ([queryRef, _path]) => queryRef.dispose(),
});

// TODO Build this query from fragments!
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
    userQuery: UserData$key;
    realm: NonNullable<RealmQueryResponse["realm"]>;
    path: string;
};

const RealmPage: React.FC<Props> = ({ userQuery, realm, path }) => {
    const siteTitle = useTranslatedConfig(CONFIG.siteTitle);
    const breadcrumbs = realm.ancestors
        .concat(realm)
        .map(({ name, path }) => ({
            label: name,
            link: `${path}`,
        }));

    const isRoot = realm.parent === null;
    const title = isRoot ? siteTitle : realm.name;
    const mainNav = <Nav key="nav" fragRef={realm} />;
    const nav = realm.canCurrentUserEdit
        ? [mainNav, <RealmEditLinks key="edit-buttons" path={path} />]
        : [mainNav];
    useTitle(title, isRoot);

    return (
        <Root nav={nav} userQuery={userQuery}>
            {!isRoot && <Breadcrumbs path={breadcrumbs} />}
            {title && <h1>{title}</h1>}
            <Blocks realm={realm} />
        </Root>
    );
};

export const RealmEditLinks: React.FC<{ path: string }> = ({ path }) => {
    const { t } = useTranslation();

    const items = [
        <LinkWithIcon key={0} to={`/~manage/realm?path=${path}`} iconPos="left">
            <FiTool />
            {t("realm.page-settings")}
        </LinkWithIcon>,
        <LinkWithIcon key={1} to={`/~manage/realm/content?path=${path}`} iconPos="left">
            <FiLayout />
            {t("realm.edit-page-content")}
        </LinkWithIcon>,
        <LinkWithIcon key={1} to={`/~manage/realm/add-child?parent=${path}`} iconPos="left">
            <FiPlus />
            {t("realm.add-sub-page")}
        </LinkWithIcon>,
    ];

    return <LinkList items={items} />;
};
