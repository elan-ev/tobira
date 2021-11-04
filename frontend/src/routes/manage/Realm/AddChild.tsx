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
import { useRouter } from "../../../router";
import { useForm } from "react-hook-form";
import { Input } from "../../../ui/Input";
import { Form } from "../../../ui/Form";
import { PathSegmentInput } from "../../../ui/PathSegmentInput";
import { NoPath, PathInvalid } from ".";
import { boxError, ErrorBox } from "../../../ui/error";
import { displayCommitError, RealmSettingsContainer, realmValidations } from "./util";
import { Button } from "../../../ui/Button";
import { AddChildMutationResponse } from "../../../query-types/AddChildMutation.graphql";
import { Spinner } from "../../../ui/Spinner";
import { Nav } from "../../../layout/Navigation";
import { makeRoute } from "../../../rauta";


// Route definition

export const PATH = "/~manage/realm/add-child";

export const AddChildRoute = makeRoute<Props>({
    path: PATH,
    prepare: (_, getParams) => {
        const parent = getParams.get("parent");
        return {
            queryRef: parent == null ? null : loadQuery(query, { parent }),
        };
    },
    render: props => <DispatchPathSpecified {...props} />,
});


const query = graphql`
    query AddChildQuery($parent: String!) {
        parent: realmByPath(path: $parent) {
            id
            name
            isRoot
            path
            canCurrentUserEdit
            children { path }
            ... NavigationData
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
const DispatchPathSpecified: React.FC<Props> = ({ queryRef }) => (
    queryRef == null
        ? <NoPath />
        : <DispatchRealmExists queryRef={queryRef} />
);

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
        ? <Root nav={[]}><PathInvalid /></Root>
        : <Root nav={<Nav fragRef={parent} />}><AddChild parent={parent} /></Root>;
};


const addChildMutation = graphql`
    mutation AddChildMutation($realm: NewRealm!) {
        addRealm(realm: $realm) {
            path
            parent { ...NavigationData }
        }
    }
`;

type AddChildProps = {
    parent: Exclude<AddChildQueryResponse["parent"], null>;
};

/** The actual settings page */
const AddChild: React.FC<AddChildProps> = ({ parent }) => {
    const { t } = useTranslation();
    if (!parent.canCurrentUserEdit) {
        return <ErrorBox>
            {t("errors.not-authorized-to-view-page")}
            {}
        </ErrorBox>;
    }

    type FormData = {
        name: string;
        pathSegment: string;
    };

    const { register, handleSubmit, formState: { errors } } = useForm<FormData>();
    const [commitError, setCommitError] = useState<JSX.Element | null>(null);

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
                setCommitError(displayCommitError(error, t("manage.add-child.failed-to-add")));
            },
        });
    });

    const validations = realmValidations(t);

    return (
        <RealmSettingsContainer>
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
                    {boxError(errors.name?.message)}
                </div>

                <div>
                    {/* TODO: Add explanation on how to chose a good path segment */}
                    <label htmlFor="path-field">{t("manage.add-child.path-segment")}</label>
                    <PathSegmentInput
                        id="path-field"
                        base={parent.path}
                        error={!!errors.pathSegment}
                        {...register("pathSegment", validations.path)}
                    />
                    {boxError(errors.pathSegment?.message)}
                </div>

                <div>
                    <div css={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <Button type="submit" disabled={isInFlight}>
                            {t("manage.add-child.button-create-page")}
                        </Button>
                        {isInFlight && <Spinner size={20} />}
                    </div>
                    {boxError(commitError)}
                </div>
            </Form>
        </RealmSettingsContainer>
    );
};
