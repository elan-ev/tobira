import i18n from "../../../i18n";
import { Trans, useTranslation } from "react-i18next";
import { graphql, useMutation } from "react-relay";
import { buttonStyle, Card, useAppkitConfig, useColorScheme } from "@opencast/appkit";

import { Link } from "../../../router";
import { NotAuthorized } from "../../../ui/error";
import { isRealUser, useUser } from "../../../User";
import { AuthorizedEvent, makeManageVideoRoute } from "./Shared";
import { ExternalLink } from "../../../relay/auth";
import { translatedConfig } from "../../../util";
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


export const ManageVideoDetailsRoute = makeManageVideoRoute(
    "details",
    "",
    authEvent => <DetailsPage
        kind="video"
        pageTitle="video.details"
        item={{ ...authEvent, updated: authEvent.syncedData?.updated }}
        breadcrumb={{
            label: i18n.t("manage.video.table"),
            link: ManageVideosRoute.url,
        }}
        sections={event => [
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

const updateEventMetadata = graphql`
    mutation VideoDetailsMetadataMutation($id: ID!, $metadata: BasicMetadata!) {
        updateEventMetadata(id: $id, metadata: $metadata) { id hasActiveWorkflows }
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

    return <ButtonSection>
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
    </ButtonSection>;
};

const VideoMetadataSection: React.FC<{ event: AuthorizedEvent }> = ({ event }) => {
    const [commit, inFlight] = useMutation<VideoDetailsMetadataMutation>(updateEventMetadata);

    return <>
        {event.hasActiveWorkflows && <Card kind="info" css={{ marginBottom: -14 }}>
            <Trans i18nKey="manage.metadata-form.event-workflow-active" />
        </Card>}
        <MetadataSection
            disabled={event.hasActiveWorkflows}
            {...{ commit, inFlight }}
            item={event}
        />
    </>;
};
