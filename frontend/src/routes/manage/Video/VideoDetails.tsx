import i18n from "../../../i18n";
import { useRef } from "react";
import { Trans, useTranslation } from "react-i18next";
import { graphql, useMutation } from "react-relay";
import { Button, buttonStyle, useAppkitConfig, useColorScheme } from "@opencast/appkit";

import { Link, useRouter } from "../../../router";
import { NotAuthorized } from "../../../ui/error";
import { isRealUser, useUser } from "../../../User";
import { AuthorizedEvent, makeManageVideoRoute } from "./Shared";
import { ExternalLink } from "../../../relay/auth";
import { currentRef, translatedConfig } from "../../../util";
import { DirectVideoRoute, VideoRoute } from "../../Video";
import { ManageVideosRoute } from ".";
import CONFIG from "../../../config";
import { displayCommitError } from "../Realm/util";
import { ConfirmationModal, ConfirmationModalHandle } from "../../../ui/Modal";
import {
    UpdatedCreatedInfo,
    DetailsPage,
    DirectLink,
    MetadataSection,
} from "../Shared/Details";


export const ManageVideoDetailsRoute = makeManageVideoRoute(
    "details",
    "",
    authEvent => <DetailsPage
        pageTitle="manage.my-videos.details.title"
        item={{ ...authEvent, updated: authEvent.syncedData?.updated }}
        breadcrumb={{
            label: i18n.t("manage.my-videos.title"),
            link: ManageVideosRoute.url,
        }}
        sections={event => [
            <UpdatedCreatedInfo key="created-info" item={{
                ...event,
                updated: event.syncedData?.updated }}
            />,
            <ButtonSection key="button-section" event={authEvent} />,
            <DirectLink key="direct-link" withTimestamp url={
                new URL(DirectVideoRoute.url({ videoId: authEvent.id }), document.baseURI)
            } />,
            <MetadataSection key="metadata" item={event} />,
            <div key="host-realms" css={{ marginBottom: 32 }}>
                <HostRealms event={authEvent} />
            </div>,
        ]}
    />
);

const deleteVideoMutation = graphql`
    mutation VideoDetailsDeleteMutation($id: ID!) {
        deleteVideo(id: $id) { id }
    }
`;

const ButtonSection: React.FC<{ event: AuthorizedEvent }> = ({ event }) => {
    const { t, i18n } = useTranslation();
    const { isHighContrast } = useColorScheme();
    const config = useAppkitConfig();
    const user = useUser();
    if (!isRealUser(user)) {
        return <NotAuthorized />;
    }

    return <div css={{ display: "flex", gap: 12, marginBottom: 16 }}>
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
            </ExternalLink>
        )}
        <DeleteButton {...{ event }} />
    </div>;
};

type Props = {
    event: AuthorizedEvent;
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
                <ul>{event.hostRealms.map(realm => (
                    <li key={realm.id}>
                        {realm.isMainRoot ? <i>{t("general.homepage")}</i> : realm.name}
                        &nbsp;
                        (<Link to={realm.path}>{t("general.page")}</Link>,
                        &nbsp;
                        <Link to={VideoRoute.url({ realmPath: realm.path, videoID: event.id })}>
                            {t("video.video")}
                        </Link>)
                    </li>
                ))}</ul>
            </>
        }
    </>;
};
