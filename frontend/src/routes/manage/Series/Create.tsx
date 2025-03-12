import { useEffect, useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { graphql, useFragment, useMutation } from "react-relay";
import { useTranslation } from "react-i18next";
import { boxError, Button, Spinner, unreachable } from "@opencast/appkit";

import { RootLoader } from "../../../layout/Root";
import { makeRoute } from "../../../rauta";
import { loadQuery } from "../../../relay";
import { CreateQuery } from "./__generated__/CreateQuery.graphql";
import { useUser, isRealUser } from "../../../User";
import { Acl, AclSelector, knownRolesFragment } from "../../../ui/Access";
import { defaultAclMap } from "../../../util/roles";
import { Form } from "../../../ui/Form";
import { InputContainer, TitleLabel } from "../../../ui/metadata";
import { Input, TextArea } from "../../../ui/Input";
import { READ_WRITE_ACTIONS } from "../../../util/permissionLevels";
import { AccessKnownRolesData$key } from "../../../ui/__generated__/AccessKnownRolesData.graphql";
import { ManageNav } from "..";
import { PageTitle } from "../../../layout/header/ui";
import { displayCommitError } from "../Realm/util";
import { LuCheckCircle } from "react-icons/lu";
import { useRouter } from "../../../router";
import { keyOfId } from "../../../util";
import { PATH as MANAGE_PATH } from ".";
import { CreateSeriesMutation } from "./__generated__/CreateSeriesMutation.graphql";
import { useNotification } from "../../../ui/NotificationContext";


export const CREATE_SERIES_PATH = "/~manage/create-series";

export const CreateSeriesRoute = makeRoute({
    url: CREATE_SERIES_PATH,
    match: url => {
        if (url.pathname !== CREATE_SERIES_PATH) {
            return null;
        }

        const queryRef = loadQuery<CreateQuery>(query, {});

        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={() => <ManageNav active={CREATE_SERIES_PATH} />}
                render={data => <CreateSeriesPage knownRolesRef={data} />
                }
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

const query = graphql`
    query CreateQuery {
        ... UserData
        ... AccessKnownRolesData
    }
`;

const createSeriesMutation = graphql`
    mutation CreateSeriesMutation($title: String!, $description: String, $acl: [AclInputEntry!]!) {
        createSeries(title: $title, description: $description, acl: $acl) { id }
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
    const user = useUser();
    const router = useRouter();
    const { t } = useTranslation();
    const titleFieldId = useId();
    const descriptionFieldId = useId();
    const knownRoles = useFragment(knownRolesFragment, knownRolesRef);
    const [commit, inFlight] = useMutation<CreateSeriesMutation>(createSeriesMutation);
    const [success, setSuccess] = useState(false);
    const [commitError, setCommitError] = useState<JSX.Element | null>(null);
    const { setNotification } = useNotification();

    if (!isRealUser(user)) {
        return unreachable();
    }

    const defaultAcl = defaultAclMap(user);
    const {
        register, handleSubmit, control,
        formState: { errors, isValid, isDirty },
    } = useForm<Metadata>({
        mode: "onChange",
        defaultValues: { acl: defaultAcl },
    });

    const createSeries = (data: Metadata) => {
        commit({
            variables: {
                title: data.title,
                description: data.description,
                acl: [...data.acl].map(
                    ([role, { actions }]) => ({
                        role,
                        actions: [...actions],
                    })
                ),
            },
            onCompleted: response => {
                const returnPath = `${MANAGE_PATH}/${keyOfId(response.createSeries.id)}`;
                setSuccess(true);
                setNotification({
                    kind: "info",
                    message: () => t("manage.my-series.details.created-note"),
                    scope: returnPath,
                });
                router.goto(returnPath);
            },
            onError: error => setCommitError(displayCommitError(error)),
        });
    };

    const onSubmit = handleSubmit(data => createSeries(data));

    useEffect(() => {
        if (!success) {
            return;
        }

        const timer = setTimeout(() => setSuccess(false), 1000);
        return () => clearTimeout(timer);
    }, [success]);


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
                        userIsRequired
                        onChange={field.onChange}
                        acl={field.value}
                        knownRoles={knownRoles}
                        permissionLevels={READ_WRITE_ACTIONS}
                    />}
                />
            </InputContainer>

            {/* Submit button */}
            <div css={{ display: "flex", marginTop: 32 }}>
                <Button
                    kind="call-to-action"
                    disabled={!!commitError || inFlight || !isValid}
                    onClick={onSubmit}>
                    {t("manage.my-series.create.title")}
                </Button>
                <span css={{
                    display: "flex",
                    alignSelf: "center",
                    marginLeft: 12,
                    position: "relative",
                    width: 20,
                    height: 20,
                }}>
                    <Spinner
                        size={20}
                        css={{
                            position: "absolute",
                            transition: "opacity ease-out 250ms",
                            opacity: inFlight ? 1 : 0,
                        }}
                    />
                    <LuCheckCircle
                        size={20}
                        css={{
                            position: "absolute",
                            transition: "opacity ease-in 300ms",
                            opacity: success && !isDirty ? 1 : 0,
                        }}
                    />
                </span>
            </div>
        </Form>
        {boxError(commitError)}
    </>;
};


