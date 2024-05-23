import { Trans, useTranslation } from "react-i18next";
import { LuExternalLink } from "react-icons/lu";

import { useId, useRef, useState } from "react";
import { Link, useRouter } from "../../../router";
import { NotAuthorized } from "../../../ui/error";
import { Form } from "../../../ui/Form";
import { CopyableInput, Input, InputWithCheckbox, TextArea, TimeInput } from "../../../ui/Input";
import { InputContainer, TitleLabel } from "../../../ui/metadata";
import { isRealUser, useUser } from "../../../User";
import { Breadcrumbs } from "../../../ui/Breadcrumbs";
import { PageTitle } from "../../../layout/header/ui";
import { AuthorizedEvent, makeManageVideoRoute, PAGE_WIDTH } from "./Shared";
import { ExternalLink } from "../../../relay/auth";
import { Button, buttonStyle, useAppkitConfig, useColorScheme } from "@opencast/appkit";
import { COLORS } from "../../../color";
import { currentRef, secondsToTimeString, translatedConfig } from "../../../util";
import { DirectVideoRoute, VideoRoute } from "../../Video";
import { ManageRoute } from "..";
import { ManageVideosRoute } from ".";
import CONFIG from "../../../config";
import { graphql, useMutation } from "react-relay";
import { displayCommitError } from "../Realm/util";
import { ConfirmationModal, ConfirmationModalHandle } from "../../../ui/Modal";


export const ManageVideoDetailsRoute = makeManageVideoRoute(
    "details",
    "",
    event => <Page event={event} />,
);

const deleteVideoMutation = graphql`
    mutation DetailsDeleteVideoMutation($id: ID!) {
        deleteVideo(id: $id) { id }
    }
`;

type Props = {
    event: AuthorizedEvent;
};

const Page: React.FC<Props> = ({ event }) => {
    const { t, i18n } = useTranslation();
    const { isHighContrast } = useColorScheme();
    const config = useAppkitConfig();

    const breadcrumbs = [
        { label: t("user.manage-content"), link: ManageRoute.url },
        { label: t("manage.my-videos.title"), link: ManageVideosRoute.url },
    ];

    const user = useUser();
    if (!isRealUser(user)) {
        return <NotAuthorized />;
    }

    return <>
        <Breadcrumbs path={breadcrumbs} tail={event.title} />
        <PageTitle title={t("manage.my-videos.details.title")} />
        <section css={{
            width: PAGE_WIDTH,
            maxWidth: "100%",
            marginBottom: 32,
        }}>
            <UpdatedCreatedInfo event={event} />
            <div css={{ margin: "8px 2px", flex: "1 0 auto" }}>
                <div css={{ display: "flex", gap: 12, marginBottom: 16 }}>
                    {user.canUseEditor && !event.isLive && event.canWrite && (
                        <ExternalLink
                            service="EDITOR"
                            params={{
                                id: event.opencastId,
                                callbackUrl: document.location.href,
                                callbackSystem: translatedConfig(CONFIG.siteTitle, i18n),
                            }}
                            fallback="button"
                            css={buttonStyle(config, "normal", isHighContrast)}
                        >
                            {t("manage.my-videos.details.open-in-editor")}
                            <LuExternalLink size={16} />
                        </ExternalLink>
                    )}
                    <DeleteButton {...{ event }} />
                </div>
                <DirectLink {...{ event }} />
                <MetadataSection {...{ event }} />
            </div>
        </section>
        <section css={{ marginBottom: 32 }}>
            <HostRealms {...{ event }} />
        </section>
    </>;
};

const DeleteButton: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation();
    const router = useRouter();
    const [commit] = useMutation(deleteVideoMutation);
    const modalRef = useRef<ConfirmationModalHandle>(null);


    const deleteVideo = () => {
        commit({
            variables: {
                id: event.id,
            },
            updater: store => store.invalidateStore(),
            onCompleted: () => {
                currentRef(modalRef).done();
                router.goto("/~manage/videos");
            },
            onError: error => {
                const failedAction = t("manage.my-videos.details.delete.failed");
                currentRef(modalRef).reportError(displayCommitError(error, failedAction));
            },
        });
    };

    return <>
        <Button kind="danger" onClick={() => currentRef(modalRef).open()}>
            <span css={{ whiteSpace: "normal", textWrap: "balance" }}>
                {t("manage.my-videos.details.delete.title")}
            </span>
        </Button>
        <ConfirmationModal
            title={t("manage.my-videos.details.delete.confirm")}
            buttonContent={t("manage.my-videos.details.delete.title")}
            onSubmit={deleteVideo}
            ref={modalRef}
        >
            <p>
                <Trans i18nKey="manage.my-videos.details.delete.cannot-be-undone" />
            </p>
        </ConfirmationModal>
    </>;
};

const DirectLink: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation();
    const [timestamp, setTimestamp] = useState(0);
    const [checkboxChecked, setCheckboxChecked] = useState(false);

    let url = new URL(DirectVideoRoute.url({ videoId: event.id }), document.baseURI);
    if (timestamp && checkboxChecked) {
        url = new URL(url + `?t=${secondsToTimeString(timestamp)}`);
    }

    return (
        <div css={{ marginBottom: 40 }}>
            <div css={{ marginBottom: 4 }}>
                {t("manage.my-videos.details.share-direct-link") + ":"}
            </div>
            <CopyableInput
                label={t("manage.my-videos.details.copy-direct-link-to-clipboard")}
                value={url.href}
                css={{ width: "100%", fontSize: 14, marginBottom: 6 }}
            />
            <InputWithCheckbox
                {...{ checkboxChecked, setCheckboxChecked }}
                label={t("manage.my-videos.details.set-time")}
                input={<TimeInput {...{ timestamp, setTimestamp }} disabled={!checkboxChecked} />}
            />
        </div>
    );
};

/** Shows the `created` and `updated` timestamps. */
const UpdatedCreatedInfo: React.FC<Props> = ({ event }) => {
    const { t, i18n } = useTranslation();
    const created = new Date(event.created).toLocaleString(i18n.language);
    const updated = event.syncedData?.updated == null
        ? null
        : new Date(event.syncedData.updated).toLocaleString(i18n.language);

    return (
        <div css={{ marginBottom: 16, fontSize: 14 }}>
            <DateValue label={t("video.created")} value={created} />
            {updated && <DateValue label={t("video.updated")} value={updated} />}
        </div>
    );
};

type DateValueProps = {
    label: string;
    value: string;
};

const DateValue: React.FC<DateValueProps> = ({ label, value }) => (
    <span css={{ "&:not(:last-child):after": { content: "'•'", margin: "0 12px" } }}>
        <span css={{ color: COLORS.neutral60, lineHeight: 1 }}>{label + ":"}</span>
        <span css={{ marginLeft: 6, marginTop: 4 }}>{value}</span>
    </span>
);

const MetadataSection: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation();
    const titleFieldId = useId();
    const descriptionFieldId = useId();

    return (
        <Form noValidate>
            <InputContainer>
                <TitleLabel htmlFor={titleFieldId} />
                <Input
                    id={titleFieldId}
                    value={event.title}
                    disabled
                    css={{ width: "100%" }}
                />
            </InputContainer>

            <InputContainer>
                <label htmlFor={descriptionFieldId}>
                    {t("upload.metadata.description")}
                </label>
                <TextArea id={descriptionFieldId} disabled value={event.description ?? ""} />
            </InputContainer>
        </Form>
    );
};

const HostRealms: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation();

    return <>
        <h2 css={{ fontSize: 20, marginBottom: 8 }}>
            {t("manage.my-videos.details.referencing-pages")}
        </h2>
        {event.hostRealms.length === 0
            ? <i>{t("manage.my-videos.details.no-referencing-pages")}</i>
            : <>
                <p>{t("manage.my-videos.details.referencing-pages-explanation")}</p>
                <ul>{event.hostRealms.map(realm => <li key={realm.id}>
                    {realm.isMainRoot ? <i>{t("general.homepage")}</i> : realm.name}
                    &nbsp;
                    (<Link to={realm.path}>{t("general.page")}</Link>,
                    &nbsp;
                    <Link to={VideoRoute.url({ realmPath: realm.path, videoID: event.id })}>
                        {t("video.video")}
                    </Link>)
                </li>)}</ul>
            </>}
    </>;
};
