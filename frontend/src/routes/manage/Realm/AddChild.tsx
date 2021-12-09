import React, { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { graphql, useMutation } from "react-relay";
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
import { NotAuthorized, PathInvalid } from ".";
import { boxError } from "../../../ui/error";
import { displayCommitError, RealmSettingsContainer, realmValidations } from "./util";
import { Button } from "../../../ui/Button";
import { AddChildMutationResponse } from "../../../query-types/AddChildMutation.graphql";
import { Spinner } from "../../../ui/Spinner";
import { Nav } from "../../../layout/Navigation";
import { makeRoute } from "../../../rauta";
import { QueryLoader } from "../../../util/QueryLoader";


export const PATH = "/~manage/realm/add-child";

export const AddChildRoute = makeRoute<PreloadedQuery<AddChildQuery>, ["parent"]>({
    path: PATH,
    queryParams: ["parent"],
    prepare: ({ queryParams: { parent } }) => loadQuery(query, { parent }),
    render: queryRef => <QueryLoader {...{ query, queryRef }} render={result => {
        const { parent } = result;
        const nav = !parent ? [] : <Nav fragRef={parent} />;

        let inner;
        if (!parent) {
            inner = <PathInvalid />;
        } else if (!parent.canCurrentUserEdit) {
            inner = <NotAuthorized />;
        } else {
            inner = <AddChild parent={parent} />;
        }

        return <Root nav={nav} userQuery={result}>{inner}</Root>;
    }} />,
    dispose: queryRef => queryRef.dispose(),
});


const query = graphql`
    query AddChildQuery($parent: String!) {
        ... UserData
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

const addChildMutation = graphql`
    mutation AddChildMutation($realm: NewRealm!) {
        addRealm(realm: $realm) {
            path
            parent { ...NavigationData }
        }
    }
`;

type Props = {
    parent: NonNullable<AddChildQueryResponse["parent"]>;
};

const AddChild: React.FC<Props> = ({ parent }) => {
    const { t } = useTranslation();

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
                        <Button type="submit" kind="happy" disabled={isInFlight}>
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
