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
import { Route } from "../../../router";
import { navData } from "..";
import { ChildOrder } from "./ChildOrder";
import { General } from "./General";
import { DangerZone } from "./DangerZone";
import { LinkButton } from "../../../ui/Button";
import { FiArrowRightCircle, FiPlus } from "react-icons/fi";
import { TFunction } from "i18next";
import { RegisterOptions } from "react-hook-form";
import { Card } from "../../../ui/Card";


// Route definition

export const PATH = "/~manage/realm";

export const ManageRealmRoute: Route<Props> = {
    path: PATH,
    prepare: (_, getParams) => {
        const path = getParams.get("path");
        return {
            queryRef: path == null ? null : loadQuery(query, { path }),
        };
    },
    render: props => <DispatchPathSpecified {...props} />,
};


const query = graphql`
    query RealmManageQuery($path: String!) {
        realm: realmByPath(path: $path) {
            name
            isRoot
            path
            numberOfDescendants
            ... GeneralRealmData
            ... ChildOrderEditData
            ... DangerZoneRealmData
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
const DispatchPathSpecified: React.FC<Props> = ({ queryRef }) => {
    const { t } = useTranslation();

    const inner = queryRef == null ? <LandingPage /> : <DispatchRealmExists queryRef={queryRef} />;
    return <Root navSource={navData(t, PATH)}>{inner}</Root>;
};


/** If no realm path is given, we just tell the user how to get going */
const LandingPage: React.FC = () => {
    const { t } = useTranslation();

    return <>
        <h1>{t("manage.realm.nav-label")}</h1>

        <p css={{ maxWidth: 600 }}>{t("manage.realm.landing-page.body")}</p>
    </>;
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
        ? <PathInvalid />
        : <SettingsPage realm={realm} />;
};


// TODO: improve
const PathInvalid: React.FC = () => <p>Error: Path invalid</p>;


type SettingsPageProps = {
    realm: Exclude<RealmManageQueryResponse["realm"], null>;
};

/** The actual settings page */
const SettingsPage: React.FC<SettingsPageProps> = ({ realm }) => {
    const { t } = useTranslation();
    const heading = realm.isRoot
        ? t("manage.realm.heading-root")
        : t("manage.realm.heading", { realm: realm.name });

    return (
        <div css={{
            maxWidth: 900,
            "& > section": {
                marginBottom: 64,
                "& > h2": { marginBottom: 16 },
            },
        }}>
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
        </div>
    );
};

type RealmValidations = {
    name: RegisterOptions;
    path: RegisterOptions;
};
export const realmValidations = (t: TFunction): RealmValidations => ({
    name: {
        required: t<string>("manage.realm.name-must-not-be-empty"),
    },
    path: {
        required: t<string>("manage.realm.path-must-not-be-empty"),
        minLength: {
            value: 2,
            message: t("manage.realm.path-too-short"),
        },
        pattern: {
            // Lowercase letter, decimal number or dash.
            value: /^(\p{Ll}|\p{Nd}|-)*$/u,
            message: t("manage.realm.path-must-be-alphanum-dash"),
        },
        // TODO: check if path already exists
    },
});

export const ErrorBox: React.FC = ({ children }) => (
    children == null
        ? null
        : <div css={{ marginTop: 8 }}>
            <Card kind="error">{children}</Card>
        </div>
);
