import React from "react";
import { useTranslation } from "react-i18next";
import { graphql, usePreloadedQuery } from "react-relay";
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


// Route definition

export const PATH = "/~manage/realm";

export const ManageRealmRoute = makeRoute<Props>({
    path: PATH,
    prepare: (_, getParams) => {
        const path = getParams.get("path");
        return {
            queryRef: path == null ? null : loadQuery(query, { path }),
        };
    },
    render: props => <DispatchPathSpecified {...props} />,
    dispose: prepared => prepared.queryRef?.dispose(),
});


const query = graphql`
    query RealmManageQuery($path: String!) {
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
    queryRef: null | PreloadedQuery<RealmManageQuery>;
};

/**
 * Entry point: checks if a path is given. If so forwards to `DispatchRealmExists`,
 * otherwise shows a landing page.
 */
const DispatchPathSpecified: React.FC<Props> = ({ queryRef }) => (
    queryRef == null
        ? <NoPath />
        : <DispatchRealmExists queryRef={queryRef} />
);


/** Error for when no realm path is given */
export const NoPath: React.FC = () => {
    const { t } = useTranslation();

    return <Root nav={[]}>
        <CenteredContent>
            <Card kind="error">{t("manage.realm.no-path")}</Card>
        </CenteredContent>
    </Root>;
};


type DispatchRealmExistsProps = {
    queryRef: PreloadedQuery<RealmManageQuery>;
};

/**
 * Just checks if the realm path points to a realm. If so, forwards to `SettingsPage`;
 * `PathInvalid` otherwise.
 */
const DispatchRealmExists: React.FC<DispatchRealmExistsProps> = ({ queryRef }) => {
    const { realm } = usePreloadedQuery(query, queryRef);
    return !realm
        ? <Root nav={[]}><PathInvalid /></Root>
        : <Root nav={<Nav fragRef={realm} />}><SettingsPage realm={realm} /></Root>;
};


export const PathInvalid: React.FC = () => {
    const { t } = useTranslation();
    return <CenteredContent>
        <Card kind="error">{t("manage.realm.invalid-path")}</Card>
    </CenteredContent>;
};


type SettingsPageProps = {
    realm: Exclude<RealmManageQueryResponse["realm"], null>;
};

/** The actual settings page */
const SettingsPage: React.FC<SettingsPageProps> = ({ realm }) => {
    const { t } = useTranslation();
    if (!realm.canCurrentUserEdit) {
        return <ErrorBox>
            {t("errors.not-authorized-to-view-page")}
            {}
        </ErrorBox>;
    }

    const heading = realm.isRoot
        ? t("manage.realm.heading-root")
        : t("manage.realm.heading", { realm: realm.name });

    return (
        <RealmSettingsContainer>
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
