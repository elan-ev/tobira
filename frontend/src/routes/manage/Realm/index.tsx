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
import { LinkButton } from "../../../ui/LinkButton";
import { LuCircleArrowRight, LuCirclePlus } from "react-icons/lu";
import { Card } from "@opencast/appkit";
import { RealmNav } from "../../../layout/Navigation";
import { CenteredContent } from "../../../ui";
import { NotAuthorized } from "../../../ui/error";
import { RealmSettingsContainer } from "./util";
import { makeRoute } from "../../../rauta";
import { Breadcrumbs } from "../../../ui/Breadcrumbs";
import { PageTitle } from "../../../layout/header/ui";
import { RealmEditLinks } from "../../Realm";
import { realmBreadcrumbs } from "../../../util/realm";
import { AddChildRoute } from "./AddChild";
import { RealmPermissions } from "./RealmPermissions";


// Route definition

const PATH = "/~manage/realm";

export const ManageRealmRoute = makeRoute({
    url: ({ realmPath }: { realmPath: string }) =>
        `${PATH}?${new URLSearchParams({ path: realmPath })}`,
    match: url => {
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
                        <RealmNav key="main-nav" fragRef={data.realm} />,
                        <RealmEditLinks key="edit-buttons" path={data.realm.path} />,
                    ]
                    : []}
                render={data => data.realm
                    ? <SettingsPage realm={data.realm} {...{ data }} />
                    : <PathInvalid />
                }
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});


const query = graphql`
    query RealmManageQuery($path: String!) {
        ... UserData
        ... AccessKnownRolesData
        realm: realmByPath(path: $path) {
            name
            isMainRoot
            path
            isCurrentUserPageAdmin
            canCurrentUserModerate
            numberOfDescendants
            ancestors { name path }
            ... GeneralRealmData
            ... ChildOrderEditData
            ... DangerZoneRealmData
            ... NavigationData
            ... RealmPermissionsData
        }
    }
`;

type Props = {
    realm: NonNullable<RealmManageQuery$data["realm"]>;
    data: RealmManageQuery$data;
};

/** The actual settings page */
const SettingsPage: React.FC<Props> = ({ realm, data }) => {
    const { t } = useTranslation();
    if (!realm.canCurrentUserModerate) {
        return <NotAuthorized />;
    }

    const heading = realm.isMainRoot
        ? t("manage.realm.heading-root")
        : t("manage.realm.heading", { realm: realm.name });

    const breadcrumbs = realm.isMainRoot ? [] : realmBreadcrumbs(t, realm.ancestors.concat(realm));

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
                <LinkButton to={realm.path}>
                    {t("manage.realm.view-page")}
                    <LuCircleArrowRight />
                </LinkButton>
                <LinkButton to={AddChildRoute.url({ parent: realm.path })}>
                    {t("realm.add-sub-page")}
                    <LuCirclePlus />
                </LinkButton>
            </div>
            <section><General fragRef={realm} /></section>
            <section><ChildOrder fragRef={realm} /></section>
            {realm.isCurrentUserPageAdmin && <>
                <section><RealmPermissions fragRef={realm} {...{ data }} /></section>
                <section><DangerZone fragRef={realm} /></section>
            </>}
        </RealmSettingsContainer>
    );
};

export const PathInvalid: React.FC = () => {
    const { t } = useTranslation();
    return <CenteredContent>
        <Card kind="error">{t("manage.realm.invalid-path")}</Card>
    </CenteredContent>;
};
