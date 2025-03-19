import { useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { graphql, useFragment, useMutation } from "react-relay";
import { useTranslation } from "react-i18next";
import { boxError } from "@opencast/appkit";

import { RootLoader } from "../../../layout/Root";
import { makeRoute } from "../../../rauta";
import { loadQuery } from "../../../relay";
import { CreateSeriesQuery } from "./__generated__/CreateSeriesQuery.graphql";
import { useUser, isRealUser } from "../../../User";
import { Acl, AclSelector, knownRolesFragment } from "../../../ui/Access";
import { defaultAclMap } from "../../../util/roles";
import { Form } from "../../../ui/Form";
import { InputContainer, SubmitButtonWithStatus, TitleLabel } from "../../../ui/metadata";
import { Input, TextArea } from "../../../ui/Input";
import { READ_WRITE_ACTIONS } from "../../../util/permissionLevels";
import { AccessKnownRolesData$key } from "../../../ui/__generated__/AccessKnownRolesData.graphql";
import { ManageNav } from "..";
import { PageTitle } from "../../../layout/header/ui";
import { displayCommitError } from "../Realm/util";
import { useRouter } from "../../../router";
import { CreateSeriesMutation } from "./__generated__/CreateSeriesMutation.graphql";
import { useNotification } from "../../../ui/NotificationContext";
import { NotAuthorized } from "../../../ui/error";
import { ManageSeriesDetailsRoute } from "./SeriesDetails";


export const CREATE_SERIES_PATH = "/~manage/create-series" as const;

export const CreateSeriesRoute = makeRoute({
    url: CREATE_SERIES_PATH,
    match: url => {
        if (url.pathname !== CREATE_SERIES_PATH) {
            return null;
        }

        const queryRef = loadQuery<CreateSeriesQuery>(query, {});

        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={() => <ManageNav active={CREATE_SERIES_PATH} />}
                render={data => <CreateSeriesPage knownRolesRef={data} />}
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

const query = graphql`
    query CreateSeriesQuery {
        ... UserData
        ... AccessKnownRolesData
    }
`;

const createSeriesMutation = graphql`
    mutation CreateSeriesMutation($metadata: BasicMetadata!, $acl: [AclInputEntry!]!) {
        createSeries(metadata: $metadata, acl: $acl) { id }
    }
`;

type Metadata = {
    title: string;
    description?: string;
    acl: Acl;
};

type CreateSeriesPageProps = {
    knownRolesRef: AccessKnownRolesData$key;
};

const CreateSeriesPage: React.FC<CreateSeriesPageProps> = ({ knownRolesRef }) => {
    const { t } = useTranslation();
    const router = useRouter();
    const titleFieldId = useId();
    const descriptionFieldId = useId();
    const knownRoles = useFragment(knownRolesFragment, knownRolesRef);
    const [commit, inFlight] = useMutation<CreateSeriesMutation>(createSeriesMutation);
    const [success, setSuccess] = useState(false);
    const [commitError, setCommitError] = useState<JSX.Element | null>(null);
    const { setNotification } = useNotification();
    const user = useUser();

    const {
        register, handleSubmit, control,
        formState: { errors, isValid, isDirty },
    } = useForm<Metadata>({
        mode: "onChange",
        defaultValues: { acl: isRealUser(user) ? defaultAclMap(user) : [] },
    });

    if (!isRealUser(user) || !user.canCreateSeries) {
        return <NotAuthorized />;
    }

    const createSeries = (data: Metadata) => {
        commit({
            variables: {
                metadata: {
                    title: data.title,
                    description: data.description,
                },
                acl: [...data.acl].map(
                    ([role, { actions }]) => ({
                        role,
                        actions: [...actions],
                    }),
                ),
            },
            onCompleted: response => {
                const returnPath = ManageSeriesDetailsRoute.url({
                    seriesId: response.createSeries.id,
                });
                setSuccess(true);
                setNotification({
                    kind: "info",
                    message: () => t("manage.my-series.details.created-note"),
                    scope: returnPath,
                });
                router.goto(returnPath);
            },
            onError: error => setCommitError(displayCommitError(error)),
            updater: store => store.invalidateStore(),
        });
    };

    const onSubmit = handleSubmit(data => createSeries(data));

    return <>
        <PageTitle title={t("manage.my-series.create.title")} />
        <Form
            noValidate
            onSubmit={e => e.preventDefault()}
            {...(commitError && { inert: "true" })}
            css={{
                margin: "32px 2px",
                "label": {
                    color: "var(--color-neutral90)",
                },
                ...commitError && { opacity: 0.7 },
            }}
        >
            {/* Title */}
            <InputContainer>
                <TitleLabel htmlFor={titleFieldId} />
                <Input
                    id={titleFieldId}
                    required
                    error={!!errors.title}
                    css={{ width: 400, maxWidth: "100%" }}
                    autoFocus
                    {...register("title", {
                        required: t("metadata-form.errors.field-required") as string,
                    })}
                />
                {boxError(errors.title?.message)}
            </InputContainer>

            {/* Description */}
            <InputContainer css={{ maxWidth: 750 }}>
                <label htmlFor={descriptionFieldId}>{t("metadata-form.description")}</label>
                <TextArea id={descriptionFieldId} {...register("description")} />
            </InputContainer>

            {/* ACL */}
            <InputContainer css={{ maxWidth: 900 }}>
                <h2 css={{
                    marginTop: 32,
                    marginBottom: 12,
                    fontSize: 22,
                }}>{t("manage.shared.acl.title")}</h2>
                <Controller
                    name="acl"
                    control={control}
                    render={({ field }) => <AclSelector
                        itemType="series"
                        userIsRequired
                        onChange={field.onChange}
                        acl={field.value}
                        knownRoles={knownRoles}
                        permissionLevels={READ_WRITE_ACTIONS}
                    />}
                />
            </InputContainer>

            {/* Submit button */}
            <SubmitButtonWithStatus
                label={t("manage.my-series.create.title")}
                onClick={onSubmit}
                disabled={!!commitError || inFlight || !isValid}
                success={success && !isDirty}
                {...{ inFlight, setSuccess }}
            />
        </Form>
        {boxError(commitError)}
    </>;
};


