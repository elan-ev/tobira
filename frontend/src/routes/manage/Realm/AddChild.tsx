import React, { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { graphql, useMutation, usePreloadedQuery } from "react-relay";
import type { PreloadedQuery } from "react-relay";

import { Root } from "../../../layout/Root";
import type {
    AddChildQuery,
    AddChildQueryResponse,
} from "../../../query-types/AddChildQuery.graphql";
import { loadQuery } from "../../../relay";
import { Route, useRouter } from "../../../router";
import { navData } from "..";
import { useForm } from "react-hook-form";
import { Input } from "../../../ui/Input";
import { Form } from "../../../ui/Form";
import { PathSegmentInput } from "../../../ui/PathSegmentInput";
import { realmValidations } from ".";
import { Card } from "../../../ui/Card";
import { Button } from "../../../ui/Button";
import { AddChildMutationResponse } from "../../../query-types/AddChildMutation.graphql";


// Route definition

export const PATH = "/~manage/realm/add-child";

export const AddChildRoute: Route<Props> = {
    path: PATH,
    prepare: (_, getParams) => {
        const parent = getParams.get("parent");
        return {
            queryRef: parent == null ? null : loadQuery(query, { parent }),
        };
    },
    render: props => <DispatchPathSpecified {...props} />,
};


const query = graphql`
    query AddChildQuery($parent: String!) {
        parent: realmByPath(path: $parent) {
            id
            name
            isRoot
            path
            children { path }
        }
    }
`;


type Props = {
    queryRef: null | PreloadedQuery<AddChildQuery>;
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
        <h1>{t("manage.add-child.heading")}</h1>
        <p css={{ maxWidth: 600 }}>{t("manage.add-child.landing-page.body")}</p>
    </>;
};


type DispatchRealmExistsProps = {
    queryRef: PreloadedQuery<AddChildQuery>;
};

/**
 * Just checks if the realm path points to a realm. If so, forwards to `AddChild`;
 * `PathInvalid` otherwise.
 */
const DispatchRealmExists: React.FC<DispatchRealmExistsProps> = ({ queryRef }) => {
    const { parent } = usePreloadedQuery(query, queryRef);
    return !parent
        ? <PathInvalid />
        : <AddChild parent={parent} />;
};


// TODO: improve
const PathInvalid: React.FC = () => <p>Error: Path invalid</p>;


const addChildMutation = graphql`
    mutation AddChildMutation($realm: NewRealm!) {
        addRealm(realm: $realm) {
            path
        }
    }
`;

type AddChildProps = {
    parent: Exclude<AddChildQueryResponse["parent"], null>;
};

/** The actual settings page */
const AddChild: React.FC<AddChildProps> = ({ parent }) => {
    type FormData = {
        name: string;
        pathSegment: string;
    };

    const { t } = useTranslation();
    const { register, handleSubmit, formState: { errors } } = useForm<FormData>();
    const [error, setError] = useState(null);

    const router = useRouter();

    const [commit, isInFlight] = useMutation(addChildMutation);
    const onSubmit = handleSubmit(data => {
        commit({
            variables: {
                realm: {
                    parent: parent.id,
                    name: data.name,
                    pathSegment: data.pathSegment,
                },
            },
            onCompleted: response => {
                const typedResponse = response as AddChildMutationResponse;
                router.goto(typedResponse.addRealm.path);
            },
            onError: error => {
                console.error(error);
                setError(t("manage.add-child.generic-network-error"));
            },
        });
    });

    const validations = realmValidations(t);

    const Error: React.FC = ({ children }) => (
        children == null
            ? null
            : <div css={{ marginTop: 8 }}>
                <Card kind="error">{children}</Card>
            </div>
    );

    return (
        <div css={{
            maxWidth: 900,
            "& > section": {
                marginBottom: 64,
                "& > h2": { marginBottom: 16 },
            },
        }}>
            <h1>{t("manage.add-child.heading")}</h1>
            <p>
                {
                    parent.isRoot
                        ? t("manage.add-child.below-root")
                        : <Trans
                            i18nKey="manage.add-child.below-this-parent"
                            values={{ parent: parent.name }}
                        >Foo<strong>parent</strong>Bar</Trans>
                }
            </p>
            <Form
                onSubmit={onSubmit}
                css={{
                    margin: "32px 0",
                    "& > div": { marginBottom: 32 },
                }}
            >
                <div>
                    <label htmlFor="name-field">{t("manage.realm.general.rename-label")}</label>
                    <Input
                        id="name-field"
                        css={{ width: 350, maxWidth: "100%" }}
                        placeholder={t("manage.realm.general.rename-label")}
                        error={!!errors.name}
                        {...register("name", validations.name)}
                    />
                    <Error>{errors.name?.message}</Error>
                </div>

                <div>
                    {/* TODO: Add explanation on how to chose a good path segment */}
                    <label htmlFor="path-field">{t("manage.add-child.path-segment")}</label>
                    <PathSegmentInput
                        id="path-field"
                        base={parent.path + "/"}
                        spinner={isInFlight}
                        error={!!errors.pathSegment}
                        {...register("pathSegment", validations.path)}
                    />
                    <Error>{errors.pathSegment?.message}</Error>
                </div>

                <div>
                    <Button type="submit" disabled={isInFlight}>
                        {t("manage.add-child.button-create-page")}
                    </Button>
                    <Error>{error}</Error>
                </div>
            </Form>
        </div>
    );
};
