import React, { useId, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { graphql, useMutation } from "react-relay";

import { RootLoader } from "../../../layout/Root";
import type {
    AddChildQuery,
    AddChildQuery$data,
} from "./__generated__/AddChildQuery.graphql";
import { loadQuery } from "../../../relay";
import { useRouter } from "../../../router";
import { useForm } from "react-hook-form";
import { Input } from "../../../ui/Input";
import { Form } from "../../../ui/Form";
import { PathSegmentInput } from "../../../ui/PathSegmentInput";
import { PathInvalid } from ".";
import { boxError, NotAuthorized } from "../../../ui/error";
import { displayCommitError, RealmSettingsContainer, realmValidations } from "./util";
import { Button } from "@opencast/appkit";
import { AddChildMutation$data } from "./__generated__/AddChildMutation.graphql";
import { Spinner } from "@opencast/appkit";
import { Nav } from "../../../layout/Navigation";
import { makeRoute } from "../../../rauta";
import { ILLEGAL_CHARS, RealmEditLinks, RESERVED_CHARS } from "../../Realm";
import { Breadcrumbs } from "../../../ui/Breadcrumbs";
import { PageTitle } from "../../../layout/header/ui";
import { realmBreadcrumbs } from "../../../util/realm";
import { COLORS } from "../../../color";
import { ManageRealmContentRoute } from "./Content";
import { InfoTooltip } from "../../../ui";


const PATH = "/~manage/realm/add-child";

export const AddChildRoute = makeRoute({
    url: ({ parent }: { parent: string }) => `${PATH}?${new URLSearchParams({ parent })}`,
    match: url => {
        if (url.pathname !== PATH) {
            return null;
        }

        const parent = url.searchParams.get("parent");
        if (parent === null) {
            return null;
        }

        const queryRef = loadQuery<AddChildQuery>(query, { parent });

        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={data => data.parent
                    ? [
                        <Nav key="main-nav" fragRef={data.parent} />,
                        <RealmEditLinks key="edit-buttons" path={parent} />,
                    ]
                    : []}
                render={data => {
                    const parent = data.parent;
                    if (!parent) {
                        return <PathInvalid />;
                    } else if (!parent.canCurrentUserModerate) {
                        return <NotAuthorized />;
                    } else {
                        return <AddChild parent={parent} />;
                    }
                }}
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});


const query = graphql`
    query AddChildQuery($parent: String!) {
        ... UserData
        parent: realmByPath(path: $parent) {
            id
            name
            isMainRoot
            path
            canCurrentUserModerate
            ancestors { name path }
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
    parent: NonNullable<AddChildQuery$data["parent"]>;
};

const AddChild: React.FC<Props> = ({ parent }) => {
    const { t } = useTranslation();
    const nameFieldId = useId();
    const pathFieldId = useId();

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
            updater: store => store.invalidateStore(),
            onCompleted: response => {
                const typedResponse = response as AddChildMutation$data;
                const realmPath = typedResponse.addRealm.path;
                router.goto(ManageRealmContentRoute.url({ realmPath }));
            },
            onError: error => {
                setCommitError(displayCommitError(error, t("manage.add-child.failed-to-add")));
            },
        });
    });

    const validations = realmValidations(t);
    const breadcrumbs = parent.isMainRoot
        ? []
        : realmBreadcrumbs(t, parent.ancestors.concat(parent));

    return (
        <RealmSettingsContainer>
            <Breadcrumbs path={breadcrumbs} tail={<i>{t("realm.add-sub-page")}</i>} />
            <PageTitle title={t("manage.add-child.heading")} />
            <p>
                {
                    parent.isMainRoot
                        ? t("manage.add-child.below-root")
                        : <Trans i18nKey="manage.add-child.below-this-parent">
                            {{ parent: parent.name }}
                        </Trans>
                }
            </p>
            <Form
                onSubmit={onSubmit}
                css={{
                    margin: "32px 0",
                    "& > div": { marginBottom: 32 },
                    "label + div": { display: "flex" },
                    input: { height: 42, flexGrow: 1 },
                }}
            >
                <div css={{ width: "min(100%, 500px)" }}>
                    <label htmlFor={nameFieldId}>
                        {t("manage.realm.general.page-name")}
                        <InfoTooltip info={t("manage.add-child.page-name-info")} />
                    </label>
                    <div>
                        <Input
                            id={nameFieldId}
                            placeholder={t("manage.realm.general.page-name")}
                            error={!!errors.name}
                            autoFocus
                            {...register("name", validations.name)}
                        />
                    </div>
                    {boxError(errors.name?.message)}
                </div>

                <div css={{ width: "min(100%, 500px)" }}>
                    <label htmlFor={pathFieldId}>
                        {t("manage.add-child.path-segment")}
                        <InfoTooltip info={
                            <div css={{
                                "& code": {
                                    whiteSpace: "nowrap",
                                    borderRadius: 4,
                                    backgroundColor: COLORS.neutral15,
                                    padding: "2px 4px",
                                },
                            }}>
                                <Trans i18nKey="manage.add-child.path-segment-info">
                                    {{ illegalChars: ILLEGAL_CHARS }}
                                    {{ reservedChars: RESERVED_CHARS }}
                                </Trans>
                            </div>
                        } />
                    </label>
                    <PathSegmentInput
                        id={pathFieldId}
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
