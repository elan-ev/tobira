import i18n from "../../../i18n";
import { useTranslation } from "react-i18next";
import { graphql, useMutation } from "react-relay";
import { buttonStyle, useAppkitConfig, useColorScheme } from "@opencast/appkit";

import { Link } from "../../../router";
import { NotAuthorized } from "../../../ui/error";
import { isRealUser, useUser } from "../../../User";
import { AuthorizedEvent, makeManageVideoRoute } from "./Shared";
import { ExternalLink } from "../../../relay/auth";
import { isSynced, translatedConfig } from "../../../util";
import { DirectVideoRoute, VideoRoute } from "../../Video";
import { ManageVideosRoute } from ".";
import CONFIG from "../../../config";
import {
    DetailsPage,
    UpdatedCreatedInfo,
    DirectLink,
    DetailsMetadataSection,
    DeleteButton,
    ButtonSection,
    HostRealms,
} from "../Shared/Details";


export const ManageVideoDetailsRoute = makeManageVideoRoute(
    "details",
    "",
    authEvent => <DetailsPage
        pageTitle="manage.my-videos.details.title"
        item={{
            ...authEvent,
            updated: authEvent.syncedData?.updated,
            isSynced: isSynced(authEvent),
        }}
        breadcrumb={{
            label: i18n.t("manage.my-videos.title"),
            link: ManageVideosRoute.url,
        }}
        sections={event => [
            <UpdatedCreatedInfo key="created-info" item={event} />,
            <VideoButtonSection key="button-section" event={authEvent} />,
            <DirectLink key="direct-link" withTimestamp url={
                new URL(DirectVideoRoute.url({ videoId: authEvent.id }), document.baseURI)
            } />,
            <div key="metadata" css={{ marginBottom: 32 }}>
                <DetailsMetadataSection item={event} />
            </div>,
            <div key="host-realms" css={{ marginBottom: 32 }}>
                <HostRealms hostRealms={authEvent.hostRealms} itemLink={realmPath => (
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
    const [commit] = useMutation(deleteVideoMutation);
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
            commit={config => {
                const disposable = commit(config);
                return { [Symbol.dispose]: () => disposable.dispose() };
            }}
        />
    </ButtonSection>;
};

