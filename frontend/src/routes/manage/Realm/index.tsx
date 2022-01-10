import React from "react";
import { useTranslation } from "react-i18next";
import { graphql } from "react-relay";
import type { PreloadedQuery } from "react-relay";

import { Root } from "../../../layout/Root";
import type {
    RealmManageQuery,
    RealmManageQueryResponse,
} from "../../../query-types/RealmManageQuery.graphql";
import { loadQuery } from "../../../relay";
import { ChildOrder } from "./ChildOrder";
import { General } from "./General";
import { DangerZone } from "./DangerZone";
import { LinkButton } from "../../../ui/Button";
import { FiArrowRightCircle, FiPlus } from "react-icons/fi";
import { Card } from "../../../ui/Card";
import { Nav } from "../../../layout/Navigation";
import { CenteredContent } from "../../../ui";
import { ErrorBox } from "../../../ui/error";
import { RealmSettingsContainer } from "./util";
import { makeRoute } from "../../../rauta";
import { QueryLoader } from "../../../util/QueryLoader";


// Route definition

export const PATH = "/~manage/realm";

export const ManageRealmRoute = makeRoute<PreloadedQuery<RealmManageQuery>, ["path"]>({
    path: PATH,
    queryParams: ["path"],
    prepare: ({ queryParams: { path } }) => loadQuery(query, { path }),
    render: queryRef => <QueryLoader {...{ query, queryRef }} render={result => {
        const { realm } = result;
        const nav = !realm ? [] : <Nav fragRef={realm} />;

        return (
            <Root nav={nav} userQuery={result}>
                {!realm ? <PathInvalid /> : <SettingsPage realm={realm} />}
            </Root>
        );
    }} />,
    dispose: queryRef => queryRef.dispose(),
});


const query = graphql`
    query RealmManageQuery($path: String!) {
        ... UserData
        realm: realmByPath(path: $path) {
            name
            isRoot
            path
            canCurrentUserEdit
            numberOfDescendants
            ... GeneralRealmData
            ... ChildOrderEditData
            ... DangerZoneRealmData
            ... NavigationData
        }
    }
`;

type Props = {
    realm: Exclude<RealmManageQueryResponse["realm"], null>;
};

/** The actual settings page */
const SettingsPage: React.FC<Props> = ({ realm }) => {
    const { t } = useTranslation();
    if (!realm.canCurrentUserEdit) {
        return <NotAuthorized />;
    }

    const heading = realm.isRoot
        ? t("manage.realm.heading-root")
        : t("manage.realm.heading", { realm: realm.name });

    return (
        <RealmSettingsContainer css={{ maxWidth: 900 }}>
            <h1>{heading}</h1>
            <p>{t("manage.realm.descendants-count", { count: realm.numberOfDescendants })}</p>
            <div css={{
                margin: "32px 0",
                display: "flex",
                flexWrap: "wrap",
                gap: 16,
            }}>
                <LinkButton to={realm.path}>
                    <FiArrowRightCircle />
                    {t("manage.realm.view-page")}
                </LinkButton>
                <LinkButton to={`/~manage/realm/add-child?parent=${realm.path}`}>
                    <FiPlus />
                    {t("realm.add-sub-page")}
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

export const NotAuthorized: React.FC = () => {
    const { t } = useTranslation();
    return <ErrorBox>{t("errors.not-authorized-to-view-page")}</ErrorBox>;
};
