import { useTranslation } from "react-i18next";
import { AccessKnownRolesData$key } from "../../../ui/__generated__/AccessKnownRolesData.graphql";
import { Acl, AclSelector, knownRolesFragment } from "../../../ui/Access";
import { useRouter } from "../../../router";
import { useId, useState, PropsWithChildren } from "react";
import { useFragment, UseMutationConfig } from "react-relay";
import { useNotification } from "../../../ui/NotificationContext";
import { isRealUser, User, useUser } from "../../../User";
import { Controller, useForm } from "react-hook-form";
import { defaultAclMap } from "../../../util/roles";
import { NotAuthorized } from "../../../ui/error";
import { Disposable, MutationParameters } from "relay-runtime";
import { displayCommitError } from "../Realm/util";
import { aclMapToArray } from "../../util";
import { PageTitle } from "../../../layout/header/ui";
import { Form } from "../../../ui/Form";
import { InputContainer, SubmitButtonWithStatus, TitleLabel } from "../../../ui/metadata";
import { Input, TextArea } from "../../../ui/Input";
import { boxError } from "@opencast/appkit";
import { READ_WRITE_ACTIONS } from "../../../util/permissionLevels";


type Metadata = {
    title: string;
    description?: string;
    acl: Acl;
};

export type CreateVideoListProps<TMutation extends MutationParameters> = PropsWithChildren<{
    knownRolesRef: AccessKnownRolesData$key;
    canUserCreateList: (user: User) => boolean;
    commit: (config: UseMutationConfig<TMutation>) => Disposable;
    inFlight: boolean;
    returnPath: (response: TMutation["response"]) => string;
    kind: "series" | "playlist";
    buildVariables?: (args: {
        username: string;
    }) => Omit<TMutation["variables"], "metadata" | "acl">;
}>;

export const CreateVideoList = <TMutation extends MutationParameters>({
    knownRolesRef,
    canUserCreateList,
    commit,
    inFlight,
    returnPath,
    kind,
    buildVariables,
    children,
}: CreateVideoListProps<TMutation>) => {
    const { t } = useTranslation();
    const router = useRouter();
    const titleFieldId = useId();
    const descriptionFieldId = useId();
    const knownRoles = useFragment(knownRolesFragment, knownRolesRef);
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

    if (!isRealUser(user) || !canUserCreateList(user)) {
        return <NotAuthorized />;
    }

    const create = (data: Metadata) => {
        const rest = buildVariables?.({ username: user.username });
        const base = {
            metadata: { title: data.title, description: data.description },
            acl: aclMapToArray(data.acl),
        };
        const variables = { ...rest, ...base };

        commit({
            variables,
            onCompleted: response => {
                const path = returnPath(response);
                setSuccess(true);
                setNotification({
                    kind: "info",
                    message: () => t(`manage.${kind}.created-note`),
                    scope: path,
                });
                router.goto(path);
            },
            onError: error => setCommitError(displayCommitError(error)),
            updater: store => store.invalidateStore(),
        });
    };

    const onSubmit = handleSubmit(data => create(data));

    return <>
        <PageTitle title={t(`manage.${kind}.table.create`)} />
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
                        required: t("manage.metadata-form.errors.field-required"),
                    })}
                />
                {boxError(errors.title?.message)}
            </InputContainer>

            {/* Description */}
            <InputContainer css={{ maxWidth: 750 }}>
                <label htmlFor={descriptionFieldId}>{t("manage.metadata-form.description")}</label>
                <TextArea id={descriptionFieldId} {...register("description")} />
            </InputContainer>

            {/* Anything else (currently playlist entries) */}
            {children}

            {/* ACL */}
            <InputContainer css={{ maxWidth: 900 }}>
                <h2 css={{
                    marginTop: 32,
                    marginBottom: 12,
                    fontSize: 22,
                }}>{t("acl.title")}</h2>
                <Controller
                    name="acl"
                    control={control}
                    render={({ field }) => <AclSelector
                        itemType={kind}
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
                label={t(`manage.${kind}.table.create`)}
                onClick={onSubmit}
                disabled={!!commitError || inFlight || !isValid}
                success={success && !isDirty}
                {...{ inFlight, setSuccess }}
            />
        </Form>
        {boxError(commitError)}
    </>;
};
