import React from "react";
import { useTranslation } from "react-i18next";
import { graphql } from "react-relay";

import { RootLoader } from "../../../layout/Root";
import type {
    RealmManageQuery,
    RealmManageQuery$data,
} from "./__generated__/RealmManageQuery.graphql";
import { loadQuery } from "../../../relay";
import { ChildOrder } from "./ChildOrder";
import { General } from "./General";
import { DangerZone } from "./DangerZone";
import { LinkButton } from "../../../ui/Button";
import { FiArrowRightCircle, FiPlusCircle } from "react-icons/fi";
import { Card } from "../../../ui/Card";
import { Nav } from "../../../layout/Navigation";
import { CenteredContent } from "../../../ui";
import { NotAuthorized } from "../../../ui/error";
import { RealmSettingsContainer } from "./util";
import { makeRoute } from "../../../rauta";
import { Breadcrumbs } from "../../../ui/Breadcrumbs";
import { PageTitle } from "../../../layout/header/ui";
import { pathToQuery, RealmEditLinks } from "../../Realm";
import { realmBreadcrumbs } from "../../../util/realm";


// Route definition

export const PATH = "/~manage/realm";

export const ManageRealmRoute = makeRoute(url => {
    if (url.pathname !== PATH) {
        return null;
    }

    const path = url.searchParams.get("path");
    if (path === null) {
        return null;
    }

    const queryRef = loadQuery<RealmManageQuery>(query, { path });

    return {
        render: () => <RootLoader
            {...{ query, queryRef }}
            noindex
            nav={data => data.realm
                ? [
                    <Nav key="main-nav" fragRef={data.realm} />,
                    <RealmEditLinks key="edit-buttons" path={path} />,
                ]
                : []}
            render={data => data.realm ? <SettingsPage realm={data.realm} /> : <PathInvalid />}
        />,
        dispose: () => queryRef.dispose(),
    };
});


const query = graphql`
    query RealmManageQuery($path: String!) {
        ... UserData
        realm: realmByPath(path: $path) {
            name
            isMainRoot
            path
            canCurrentUserEdit
            numberOfDescendants
            ancestors { name path }
            ... GeneralRealmData
            ... ChildOrderEditData
            ... DangerZoneRealmData
            ... NavigationData
        }
    }
`;

type Props = {
    realm: Exclude<RealmManageQuery$data["realm"], null>;
};

/** The actual settings page */
const SettingsPage: React.FC<Props> = ({ realm }) => {
    const { t } = useTranslation();
    if (!realm.canCurrentUserEdit) {
        return <NotAuthorized />;
    }

    const heading = realm.isMainRoot
        ? t("manage.realm.heading-root")
        : t("manage.realm.heading", { realm: realm.name });

    const breadcrumbs = realm.isMainRoot ? [] : realmBreadcrumbs(t, realm.ancestors.concat(realm));
    const buttonStyle = {
        backgroundColor: "transparent",
        padding: "8px 16px",
        borderRadius: 8,
        gap: 9,
    };

    return (
        <RealmSettingsContainer css={{ maxWidth: 900 }}>
            <Breadcrumbs path={breadcrumbs} tail={<i>{t("realm.page-settings")}</i>} />
            <PageTitle title={heading} />
            <p>{t("manage.realm.descendants-count", { count: realm.numberOfDescendants })}</p>
            <div css={{
                margin: "32px 0",
                display: "flex",
                flexWrap: "wrap",
                gap: 16,
            }}>
                <LinkButton to={realm.path} css={buttonStyle}>
                    {t("manage.realm.view-page")}
                    <FiArrowRightCircle />
                </LinkButton>
                <LinkButton
                    to={`/~manage/realm/add-child?parent=${pathToQuery(realm.path)}`}
                    css={buttonStyle}
                >
                    {t("realm.add-sub-page")}
                    <FiPlusCircle />
                </LinkButton>
            </div>
            <section><General fragRef={realm} /></section>
            <section><ChildOrder fragRef={realm} /></section>
            <section><DangerZone fragRef={realm} /></section>
        </RealmSettingsContainer>
    );
};

export const PathInvalid: React.FC = () => {
    const { t } = useTranslation();
    return <CenteredContent>
        <Card kind="error">{t("manage.realm.invalid-path")}</Card>
    </CenteredContent>;
};
