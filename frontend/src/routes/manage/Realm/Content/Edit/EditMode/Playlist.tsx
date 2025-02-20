import { graphql, useFragment, useMutation } from "react-relay";
import {
    PlaylistEditModeBlockData$key,
    VideoListLayout,
    VideoListOrder,
} from "./__generated__/PlaylistEditModeBlockData.graphql";
import { PlaylistEditSaveMutation } from "./__generated__/PlaylistEditSaveMutation.graphql";
import { PlaylistEditCreateMutation } from "./__generated__/PlaylistEditCreateMutation.graphql";
import { useTranslation } from "react-i18next";
import { isRealUser, useUser } from "../../../../../../User";
import { useController, useFormContext } from "react-hook-form";
import { EditModeForm } from ".";
import { Heading, VideoListFormFields } from "./util";
import { VideoListSelector } from "../../../../../../ui/SearchableSelect";
import { InfoTooltip } from "../../../../../../ui";
import { Card } from "@opencast/appkit";

type PlaylistFormData = {
    playlist: string;
    order: VideoListOrder;
    layout: VideoListLayout;
    showTitle: boolean;
    showMetadata: boolean;
};

type EditPlaylistBlockProps = {
    block: PlaylistEditModeBlockData$key;
}

export const EditPlaylistBlock: React.FC<EditPlaylistBlockProps> = ({ block: blockRef }) => {
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

    const { t } = useTranslation();
    const user = useUser();

    const currentPlaylist = playlist?.__typename === "AuthorizedPlaylist"
        ? playlist
        : undefined;

    const form = useFormContext<PlaylistFormData>();
    const { formState: { errors }, control } = form;
    const { field: playlistField } = useController({
        defaultValue: currentPlaylist?.id,
        name: "playlist",
        control,
        rules: { required: true },
    });



    return <EditModeForm create={create} save={save} map={(data: PlaylistFormData) => data}>
        <Heading>
            {t("manage.realm.content.playlist.playlist.heading")}
            {isRealUser(user) && !user.canFindUnlisted && <InfoTooltip
                info={t("manage.realm.content.playlist.playlist.findable-playlist-note")}
            />}
        </Heading>
        {"playlist" in errors && <div css={{ margin: "8px 0" }}>
            <Card kind="error">{t("manage.realm.content.playlist.playlist.invalid")}</Card>
        </div>}
        {playlist?.__typename === "NotAllowed" && <Card kind="error" css={{ margin: "8px 0" }}>
            {t("playlist.not-allowed-playlist-block")}
        </Card>}
        <VideoListSelector
            type="playlist"
            defaultValue={currentPlaylist == null ? undefined : {
                ...currentPlaylist,
                description: currentPlaylist.description ?? null,
            }}
            onChange={data => playlistField.onChange(data?.id)}
            onBlur={playlistField.onBlur}
            autoFocus
        />
        <VideoListFormFields allowOriginalOrder {...{
            form,
            order,
            layout,
            showMetadata,
            showTitle,
        }} />
    </EditModeForm>;
};
