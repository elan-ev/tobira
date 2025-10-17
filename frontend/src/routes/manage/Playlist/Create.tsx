import { useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { graphql, useFragment, useMutation } from "react-relay";
import { useTranslation } from "react-i18next";
import { boxError } from "@opencast/appkit";

import { RootLoader } from "../../../layout/Root";
import { makeRoute } from "../../../rauta";
import { loadQuery } from "../../../relay";
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
import { useNotification } from "../../../ui/NotificationContext";
import { NotAuthorized } from "../../../ui/error";
import { aclMapToArray } from "../../util";
import { CreatePlaylistMutation } from "./__generated__/CreatePlaylistMutation.graphql";
import { ManagePlaylistDetailsRoute } from "./PlaylistDetails";
import { CreatePlaylistQuery } from "./__generated__/CreatePlaylistQuery.graphql";
import { ListEvent, VideoListMenu } from "../Shared/EditVideoList";


export const CREATE_PLAYLIST_PATH = "/~manage/create-playlist" as const;

export const CreatePlaylistRoute = makeRoute({
    url: CREATE_PLAYLIST_PATH,
    match: url => {
        if (url.pathname !== CREATE_PLAYLIST_PATH) {
            return null;
        }

        const queryRef = loadQuery<CreatePlaylistQuery>(query, {});

        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={() => <ManageNav active={CREATE_PLAYLIST_PATH} />}
                render={data => <CreatePlaylistPage knownRolesRef={data} />}
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

const query = graphql`
    query CreatePlaylistQuery {
        ... UserData
        ... AccessKnownRolesData
    }
`;

const createPlaylistMutation = graphql`
    mutation CreatePlaylistMutation(
        $metadata: BasicMetadata!,
        $acl: [AclInputEntry!]!,
        $creator: String!,
        $entries: [ID!]!,
    ) {
        createPlaylist(
            metadata: $metadata,
            acl: $acl,
            creator: $creator,
            entries: $entries,
        ) { id }
    }
`;

type Metadata = {
    title: string;
    description?: string;
    acl: Acl;
};

type CreatePlaylistPageProps = {
    knownRolesRef: AccessKnownRolesData$key;
};

const CreatePlaylistPage: React.FC<CreatePlaylistPageProps> = ({ knownRolesRef }) => {
    const { t } = useTranslation();
    const router = useRouter();
    const titleFieldId = useId();
    const descriptionFieldId = useId();
    const knownRoles = useFragment(knownRolesFragment, knownRolesRef);
    const [commit, inFlight] = useMutation<CreatePlaylistMutation>(createPlaylistMutation);
    const [success, setSuccess] = useState(false);
    const [commitError, setCommitError] = useState<JSX.Element | null>(null);
    const [events, setEvents] = useState<ListEvent[]>([]);
    const { setNotification } = useNotification();
    const user = useUser();

    const {
        register, handleSubmit, control,
        formState: { errors, isValid, isDirty },
    } = useForm<Metadata>({
        mode: "onChange",
        defaultValues: { acl: isRealUser(user) ? defaultAclMap(user) : [] },
    });

    if (!isRealUser(user) || !user.canCreatePlaylists) {
        return <NotAuthorized />;
    }

    const createPlaylist = (data: Metadata) => {
        commit({
            variables: {
                metadata: {
                    title: data.title,
                    description: data.description,
                },
                acl: aclMapToArray(data.acl),
                creator: user.username,
                entries: events.map(e => e.id),
            },
            onCompleted: response => {
                const returnPath = ManagePlaylistDetailsRoute.url({
                    id: response.createPlaylist.id,
                });
                setSuccess(true);
                setNotification({
                    kind: "info",
                    message: () => t("manage.playlist.created-note"),
                    scope: returnPath,
                });
                router.goto(returnPath);
            },
            onError: error => setCommitError(displayCommitError(error)),
            updater: store => store.invalidateStore(),
        });
    };

    const onSubmit = handleSubmit(data => createPlaylist(data));

    return <>
        <PageTitle title={t("manage.playlist.table.create")} />
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
                        required: t("manage.metadata-form.errors.field-required") as string,
                    })}
                />
                {boxError(errors.title?.message)}
            </InputContainer>

            {/* Description */}
            <InputContainer css={{ maxWidth: 750 }}>
                <label htmlFor={descriptionFieldId}>{t("manage.metadata-form.description")}</label>
                <TextArea id={descriptionFieldId} {...register("description")} />
            </InputContainer>

            {/* Entries */}
            <InputContainer css={{ maxWidth: 900 }}>
                <VideoListMenu {...{ events, setEvents }} isPlaylist />
            </InputContainer>

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
                        itemType="playlist"
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
                label={t("manage.playlist.table.create")}
                onClick={onSubmit}
                disabled={!!commitError || inFlight || !isValid}
                success={success && !isDirty}
                {...{ inFlight, setSuccess }}
            />
        </Form>
        {boxError(commitError)}
    </>;
};
