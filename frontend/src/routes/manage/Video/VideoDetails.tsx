import i18n from "../../../i18n";
import { useTranslation } from "react-i18next";
import { graphql, useMutation } from "react-relay";
import { buttonStyle, useAppkitConfig, useColorScheme } from "@opencast/appkit";

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
                updated: event.syncedData?.updated,
            }} />,
            <VideoButtonSection key="button-section" event={authEvent} />,
            <DirectLink key="direct-link" withTimestamp url={
                new URL(DirectVideoRoute.url({ videoId: authEvent.id }), document.baseURI)
            } />,
            <MetadataSection key="metadata" item={event} />,
            <div key="host-realms" css={{ marginBottom: 32 }}>
                <HostRealms kind="videos" hostRealms={authEvent.hostRealms} itemLink={realmPath => (
                    <Link to={VideoRoute.url({ realmPath: realmPath, videoID: authEvent.id })}>
                        {i18n.t("video.video")}
                    </Link>
                )}/>
            </div>,
        ]}
    />
);

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
        <DeleteButton
            itemId={event.id}
            itemType="video"
            returnPath="/~manage/videos"
            commit={commit}
        />
    </ButtonSection>;
};

