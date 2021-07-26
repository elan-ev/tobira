import React from "react";
import { useTranslation } from "react-i18next";
import { graphql, usePreloadedQuery } from "react-relay";
import type { PreloadedQuery } from "react-relay";

import { Root } from "../../layout/Root";
import type { RealmTreeManageQuery } from "../../query-types/RealmTreeManageQuery.graphql";
import { loadQuery } from "../../relay";
import type { Route } from "../../router";
import { navData } from ".";


export const PATH = "/~manage/realm-tree";

export const ManageRealmTreeRoute: Route<Props> = {
    path: "/~manage/realm-tree",
    prepare: (_, getParams) => {
        const path = getParams.get("path");
        return {
            queryRef: path == null ? null : loadQuery(query, { path }),
        };
    },
    render: props => <ManageRealmTree {...props} />,
};


type Props = {
    queryRef: null | PreloadedQuery<RealmTreeManageQuery>;
};

const ManageRealmTree: React.FC<Props> = ({ queryRef }) => {
    const { t } = useTranslation();

    const inner = queryRef == null ? <LandingPage /> : <Impl queryRef={queryRef} />;
    return <Root navSource={navData(t, PATH)}>{inner}</Root>;
};


/** If no realm path is given, we just tell the user how to get going */
const LandingPage: React.FC = () => {
    const { t } = useTranslation();

    return <>
        <h1>{t("manage.realm-tree.title")}</h1>

        <p css={{ maxWidth: 600 }}>{t("manage.realm-tree.landing-text")}</p>
    </>;
};


const query = graphql`
    query RealmTreeManageQuery($path: String!) {
        realm: realmByPath(path: $path) {
            name
        }
    }
`;

type ImplProps = {
    queryRef: PreloadedQuery<RealmTreeManageQuery>;
};

/** The actual implementation with a given realm path */
const Impl: React.FC<ImplProps> = ({ queryRef }) => {
    const { t } = useTranslation();
    const { realm } = usePreloadedQuery(query, queryRef);

    if (!realm) {
        // TODO: proper warning box and guidance
        return <p>Error: Path invalid</p>;
    }

    return <>
        <h1>{t("manage.realm-tree.heading", { realm: realm.name })}</h1>
        <p>TODO</p>
    </>;
};
