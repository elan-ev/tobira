import { useTranslation } from "react-i18next";
import { graphql, useMutation } from "react-relay";

import {
    DeleteButton,
    DetailsPage,
    HostRealms,
    MetadataSection,
    UpdatedCreatedInfo,
} from "../Shared/Details";
import i18n from "../../../i18n";
import { ManagePlaylistsRoute } from ".";
import { Link } from "../../../router";
import { AuthorizedPlaylist, makeManagePlaylistRoute } from "./Shared";
import { DirectPlaylistRoute } from "../../Playlist";
import { useNotification } from "../../../ui/NotificationContext";
import { VideoListShareButton } from "../../../ui/Blocks/VideoList";
import { keyOfId } from "../../../util";
import {
    PlaylistDetailsDeleteMutation,
} from "./__generated__/PlaylistDetailsDeleteMutation.graphql";
import {
    PlaylistDetailsMetadataMutation,
} from "./__generated__/PlaylistDetailsMetadataMutation.graphql";



const deletePlaylistMutation = graphql`
    mutation PlaylistDetailsDeleteMutation($id: ID!) {
        deletePlaylist(id: $id) { id }
    }
`;

const updatePlaylistMetadata = graphql`
    mutation PlaylistDetailsMetadataMutation($id: ID!, $metadata: BasicMetadata!) {
        updatePlaylist(id: $id, metadata: $metadata) { id }
    }
`;


export const ManagePlaylistDetailsRoute = makeManagePlaylistRoute(
    "details",
    "",
    playlist => <DetailsPage
        pageTitle="manage.playlist.details.title"
        item={{ ...playlist, state: "READY" }}
        breadcrumb={{
            label: i18n.t("manage.playlist.table.title"),
            link: ManagePlaylistsRoute.url,
        }}
        sections={playlist => [
            <NotificationSection key="notification" />,
            <UpdatedCreatedInfo key="date-info" item={playlist} />,
            <PlaylistButtonSection key="button-section" {...{ playlist }} />,
            <PlaylistMetadataSection key="metadata" {...{ playlist }} />,
            <div key="host-realms" css={{ marginBottom: 32 }}>
                <HostRealms
                    kind="playlist"
                    hostRealms={playlist.hostRealms}
                    itemLink={() => <Link
                        to={DirectPlaylistRoute.url({ playlistId: playlist.id })}>
                        {i18n.t("series.singular")}
                    </Link>}
                />
            </div>,
        ]}
    />,
);

const NotificationSection: React.FC = () => {
    const { Notification } = useNotification();
    return <Notification />;
};


const PlaylistButtonSection: React.FC<{ playlist: AuthorizedPlaylist }> = ({ playlist }) => {
    const { t } = useTranslation();
    const [commit] = useMutation<PlaylistDetailsDeleteMutation>(deletePlaylistMutation);

    const playlistKey = keyOfId(playlist.id);
    const shareInfo = {
        shareUrl: `/!p/${playlistKey}`,
        rssUrl: `/~rss/playlist/${playlistKey}`,
    };

    return <div css={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <VideoListShareButton {...shareInfo} css={{ height: 40, borderRadius: 8 }} />
        <DeleteButton
            item={{ ...playlist, state: "READY" }}
            kind="playlist"
            returnPath="/~manage/playlists"
            commit={commit}
        >
            <br />
            <p>{t("manage.playlist.details.delete-note")}</p>
        </DeleteButton>
    </div>;
};

const PlaylistMetadataSection: React.FC<{ playlist: AuthorizedPlaylist }> = ({ playlist }) => {
    const [commit, inFlight] = useMutation<PlaylistDetailsMetadataMutation>(updatePlaylistMetadata);

    return <MetadataSection
        item={{ ...playlist, state: "READY" }}
        {...{ commit, inFlight }}
    />;
};
