import i18n from "../../../i18n";
import { Trans, useTranslation } from "react-i18next";
import { graphql, useMutation } from "react-relay";
import { buttonStyle, Card, useAppkitConfig, useColorScheme } from "@opencast/appkit";

import { Link } from "../../../router";
import { NotAuthorized } from "../../../ui/error";
import { isRealUser, useUser } from "../../../User";
import { AuthorizedEvent, makeManageVideoRoute } from "./Shared";
import { ExternalLink } from "../../../relay/auth";
import { Inertable, isSynced, translatedConfig } from "../../../util";
import { DirectVideoRoute, VideoRoute } from "../../Video";
import { ManageVideosRoute } from ".";
import CONFIG from "../../../config";
import {
    UpdatedCreatedInfo,
    DetailsPage,
    DirectLink,
    MetadataSection,
    DeleteButton,
    ButtonSection,
    HostRealms,
} from "../Shared/Details";
import { VideoDetailsDeleteMutation } from "./__generated__/VideoDetailsDeleteMutation.graphql";
import { VideoDetailsMetadataMutation } from "./__generated__/VideoDetailsMetadataMutation.graphql";
import { NotReadyNote } from "../../util";


export const ManageVideoDetailsRoute = makeManageVideoRoute(
    "details",
    "",
    authEvent => <DetailsPage
        pageTitle="video.details"
        item={{ ...authEvent, updated: authEvent.syncedData?.updated }}
        breadcrumb={{
            label: i18n.t("manage.video.table"),
            link: ManageVideosRoute.url,
        }}
        sections={event => [
            <VideoNoteSection key="video-note" {...{ event }} />,
            <UpdatedCreatedInfo key="created-info" item={{
                ...event,
                updated: event.syncedData?.updated,
            }} />,
            <VideoButtonSection key="button-section" event={authEvent} />,
            <DirectLink key="direct-link" withTimestamp={!event.isLive} url={
                new URL(DirectVideoRoute.url({ videoId: authEvent.id }), document.baseURI)
            } />,
            <VideoMetadataSection key="metadata" event={event} />,
            <div key="host-realms" css={{ marginBottom: 32 }}>
                <HostRealms kind="video" hostRealms={authEvent.hostRealms} itemLink={realmPath => (
                    <Link to={VideoRoute.url({ realmPath: realmPath, videoID: authEvent.id })}>
                        {i18n.t("video.singular")}
                    </Link>
                )}/>
            </div>,
        ]}
    />,
    { fetchWorkflowState: true },
);

const VideoNoteSection: React.FC<{ event: AuthorizedEvent }> = ({ event }) => !isSynced(event)
    ? <NotReadyNote kind="video" />
    : event.workflowStatus !== "IDLE" && <Card kind="info">
        <Trans i18nKey={`manage.video.workflow-status.${
            event.workflowStatus === "BUSY" ? "active" : "unknown"
        }`} />
    </Card>;

const updateEventMetadata = graphql`
    mutation VideoDetailsMetadataMutation($id: ID!, $metadata: BasicMetadata!) {
        updateEventMetadata(id: $id, metadata: $metadata) {
            id
            workflowStatus
        }
    }
`;

const deleteVideoMutation = graphql`
    mutation VideoDetailsDeleteMutation($id: ID!) {
        deleteVideo(id: $id) { id }
    }
`;

const VideoButtonSection: React.FC<{ event: AuthorizedEvent }> = ({ event }) => {
    const { t, i18n } = useTranslation();
    const [commit] = useMutation<VideoDetailsDeleteMutation>(deleteVideoMutation);
    const user = useUser();
    const config = useAppkitConfig();
    const { isHighContrast } = useColorScheme();

    if (!isRealUser(user)) {
        return <NotAuthorized />;
    }

    return <Inertable isInert={!isSynced(event) || event.workflowStatus !== "IDLE"}>
        <ButtonSection>
            {user.canUseEditor && !event.isLive && event.canWrite && (
                <ExternalLink
                    service="EDITOR"
                    event={event.id}
                    params={{
                        id: event.opencastId,
                        callbackUrl: document.location.href,
                        callbackSystem: translatedConfig(CONFIG.siteTitle, i18n),
                    }}
                    fallback="button"
                    css={buttonStyle(config, "normal", isHighContrast)}
                >
                    {t("manage.video.details.open-in-editor")}
                </ExternalLink>
            )}
            <DeleteButton
                item={event}
                kind="video"
                returnPath="/~manage/videos"
                commit={commit}
            />
        </ButtonSection>
    </Inertable>;
};

const VideoMetadataSection: React.FC<{ event: AuthorizedEvent }> = ({ event }) => {
    const [commit, inFlight] = useMutation<VideoDetailsMetadataMutation>(updateEventMetadata);

    return <MetadataSection
        disabled={event.workflowStatus !== "IDLE"}
        {...{ commit, inFlight }}
        item={event}
    />;
};
