import { currentRef } from "@opencast/appkit";
import { graphql, useMutation } from "react-relay";

import { AccessKnownRolesData$key } from "../../../ui/__generated__/AccessKnownRolesData.graphql";
import { displayCommitError } from "../Realm/util";
import { AccessEditor, AclPage, SubmitAclProps } from "../Shared/Access";
import i18n from "../../../i18n";
import { aclMapToArray } from "../../util";
import { AuthorizedPlaylist, makeManagePlaylistRoute } from "./Shared";
import { ManagePlaylistsRoute } from ".";
import { ManagePlaylistDetailsRoute } from "./PlaylistDetails";
import { PlaylistAccessAclMutation } from "./__generated__/PlaylistAccessAclMutation.graphql";


export const ManagePlaylistAccessRoute = makeManagePlaylistRoute(
    "acl",
    "/access",
    (playlist, data) => (
        <AclPage breadcrumbTails={[
            { label: i18n.t("manage.playlist.table.title"), link: ManagePlaylistsRoute.url },
            { label: playlist.title, link: ManagePlaylistDetailsRoute.url({ id: playlist.id }) },
        ]}>
            <PlaylistAclEditor {...{ playlist, data }} />
        </AclPage>
    ),
);

const updatePlaylistAcl = graphql`
    mutation PlaylistAccessAclMutation($id: ID!, $acl: [AclInputEntry!]!) {
        updatePlaylist(id: $id, acl: $acl) {
            ...on AuthorizedPlaylist {
                acl { role actions info { label implies large } }
            }
        }
    }
`;


type PlaylistAclPageProps = {
    playlist: AuthorizedPlaylist;
    data: AccessKnownRolesData$key;
};

const PlaylistAclEditor: React.FC<PlaylistAclPageProps> = ({ playlist, data }) => {
    const [commit, inFlight] = useMutation<PlaylistAccessAclMutation>(updatePlaylistAcl);

    const onSubmit = async ({ selections, saveModalRef, setCommitError }: SubmitAclProps) => {
        commit({
            variables: {
                id: playlist.id,
                acl: aclMapToArray(selections),
            },
            onCompleted: () => currentRef(saveModalRef).done(),
            onError: error => {
                setCommitError(displayCommitError(error));
            },
        });
    };


    return <AccessEditor
        {...{ onSubmit, inFlight, data }}
        rawAcl={playlist.acl}
        itemType="playlist"
    />;
};

