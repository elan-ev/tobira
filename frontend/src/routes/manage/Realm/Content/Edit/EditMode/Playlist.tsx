import { graphql, useFragment, useMutation } from "react-relay";
import { Card } from "@opencast/appkit";
import { useTranslation } from "react-i18next";
import { Controller } from "react-hook-form";

import {
    PlaylistEditModeBlockData$key,
    VideoListLayout,
    VideoListOrder,
} from "./__generated__/PlaylistEditModeBlockData.graphql";
import { PlaylistEditSaveMutation } from "./__generated__/PlaylistEditSaveMutation.graphql";
import { PlaylistEditCreateMutation } from "./__generated__/PlaylistEditCreateMutation.graphql";
import { isRealUser, useUser } from "../../../../../../User";
import { EditModeError, EditModeForm } from ".";
import { Heading, VideoListFormFields } from "./util";
import { VideoListSelector } from "../../../../../../ui/SearchableSelect";
import { InfoTooltip } from "../../../../../../ui";


type PlaylistFormData = {
    playlist: string;
    order: VideoListOrder;
    layout: VideoListLayout;
    displayOptions: {
        showTitle: boolean;
        showMetadata: boolean;
    }
};

type EditPlaylistBlockProps = {
    block: PlaylistEditModeBlockData$key;
}

export const EditPlaylistBlock: React.FC<EditPlaylistBlockProps> = ({ block: blockRef }) => {
    const { t } = useTranslation();
    const user = useUser();


    const { playlist, showTitle, showMetadata, order, layout } = useFragment(graphql`
        fragment PlaylistEditModeBlockData on PlaylistBlock {
            playlist {
                __typename
                ...on NotAllowed { dummy }
                ...on AuthorizedPlaylist {
                    id
                    opencastId
                    title
                    description
                }
            }
            showTitle
            showMetadata
            order
            layout
        }
    `, blockRef);


    const [save] = useMutation<PlaylistEditSaveMutation>(graphql`
        mutation PlaylistEditSaveMutation($id: ID!, $set: UpdatePlaylistBlock!) {
            updatePlaylistBlock(id: $id, set: $set) {
                ... BlocksBlockData
                ... EditBlockUpdateRealmNameData
            }
        }
    `);

    const [create] = useMutation<PlaylistEditCreateMutation>(graphql`
        mutation PlaylistEditCreateMutation($realm: ID!, $index: Int!, $block: NewPlaylistBlock!) {
            addPlaylistBlock(realm: $realm, index: $index, block: $block) {
                ... ContentManageRealmData
            }
        }
    `);


    const map = (data: PlaylistFormData) => data;

    const currentPlaylist = playlist?.__typename === "AuthorizedPlaylist"
        ? playlist
        : undefined;

    const defaultValues = {
        playlist: currentPlaylist?.id ?? "",
        order,
        layout,
        displayOptions: {
            showTitle,
            showMetadata,
        },
    };


    return <EditModeForm {...{ defaultValues, map, save, create }}>
        <Heading>
            {t("playlist.singular")}
            {isRealUser(user) && !user.canFindUnlisted && <InfoTooltip
                info={t("manage.block.playlist.findable-playlist-note")}
            />}
        </Heading>
        <EditModeError blockType="playlist" />
        {playlist?.__typename === "NotAllowed" && <Card kind="error" css={{ margin: "8px 0" }}>
            {t("playlist.not-allowed-block")}
        </Card>}
        <Controller
            name="playlist"
            defaultValue={currentPlaylist?.id}
            rules={{ required: true }}
            render={({ field: { onChange, onBlur } }) => <VideoListSelector
                type="playlist"
                defaultValue={currentPlaylist}
                onChange={data => onChange(data?.id)}
                {...{ onBlur }}
            />}
        />
        <VideoListFormFields allowOriginalOrder {...{
            order,
            layout,
            showMetadata,
            showTitle,
        }} />
    </EditModeForm>;
};
