import { useState } from "react";
import { graphql, useMutation } from "react-relay";

import { RootLoader } from "../../../layout/Root";
import { makeRoute } from "../../../rauta";
import { loadQuery } from "../../../relay";
import type { User } from "../../../User";
import { AccessKnownRolesData$key } from "../../../ui/__generated__/AccessKnownRolesData.graphql";
import { ManageNav } from "..";
import { CreatePlaylistMutation } from "./__generated__/CreatePlaylistMutation.graphql";
import { ManagePlaylistDetailsRoute } from "./PlaylistDetails";
import { CreatePlaylistQuery } from "./__generated__/CreatePlaylistQuery.graphql";
import { ListEvent, VideoListMenu } from "../Shared/EditVideoList";
import { CreateVideoList } from "../Shared/Create";
import { InputContainer } from "../../../ui/metadata";


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

type CreatePlaylistPageProps = {
    knownRolesRef: AccessKnownRolesData$key;
};

const CreatePlaylistPage: React.FC<CreatePlaylistPageProps> = ({ knownRolesRef }) => {
    const [commit, inFlight] = useMutation<CreatePlaylistMutation>(createPlaylistMutation);
    const [events, setEvents] = useState<ListEvent[]>([]);

    const canUserCreateList = (user: User) => user.canCreatePlaylists;

    return (
        <CreateVideoList
            {...{ commit, inFlight, knownRolesRef, canUserCreateList }}
            kind="playlist"
            buildVariables={({ username }) => ({
                creator: username,
                entries: events.map(e => e.id),
            })}
            returnPath={response =>
                ManagePlaylistDetailsRoute.url({ id: response.createPlaylist.id })
            }
        >
            <InputContainer css={{ maxWidth: 900 }}>
                <VideoListMenu events={events} setEvents={setEvents} isPlaylist />
            </InputContainer>
        </CreateVideoList>
    );
};
