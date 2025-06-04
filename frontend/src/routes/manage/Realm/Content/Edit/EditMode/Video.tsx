import React from "react";
import { graphql, useFragment, useMutation } from "react-relay";
import { useTranslation } from "react-i18next";
import { Controller, useFormContext } from "react-hook-form";
import { Card } from "@opencast/appkit";

import { EditModeForm } from ".";
import { Heading } from "./util";
import type {
    VideoEditModeBlockData$key,
} from "./__generated__/VideoEditModeBlockData.graphql";
import type { VideoEditSaveMutation } from "./__generated__/VideoEditSaveMutation.graphql";
import type { VideoEditCreateMutation } from "./__generated__/VideoEditCreateMutation.graphql";
import { DisplayOptionGroup } from "../../../../../../ui/Input";
import { InfoTooltip } from "../../../../../../ui";
import { isRealUser, useUser } from "../../../../../../User";
import { EventSelector } from "../../../../../../ui/EventSelector";


type VideoFormData = {
    event: string;
    showTitle: boolean;
    showLink: boolean;
};

type EditVideoBlockProps = {
    block: VideoEditModeBlockData$key;
};

export const EditVideoBlock: React.FC<EditVideoBlockProps> = ({ block: blockRef }) => {
    const { event, showTitle, showLink } = useFragment(graphql`
        fragment VideoEditModeBlockData on VideoBlock {
            event {
                __typename,
                ... on NotAllowed { dummy }
                ... on AuthorizedEvent {
                    id
                    title
                    series { id title }
                    created
                    isLive
                    creators
                    description
                    syncedData { thumbnail duration startTime endTime audioOnly }
                }
            }
            showTitle
            showLink
        }
    `, blockRef);


    const [save] = useMutation<VideoEditSaveMutation>(graphql`
        mutation VideoEditSaveMutation($id: ID!, $set: UpdateVideoBlock!) {
            updateVideoBlock(id: $id, set: $set) {
                ... VideoEditModeBlockData
                ... BlocksBlockData
                ... EditBlockUpdateRealmNameData
            }
        }
    `);

    const [create] = useMutation<VideoEditCreateMutation>(graphql`
        mutation VideoEditCreateMutation($realm: ID!, $index: Int!, $block: NewVideoBlock!) {
            addVideoBlock(realm: $realm, index: $index, block: $block) {
                ... ContentManageRealmData
            }
        }
    `);

    const { t } = useTranslation();
    const user = useUser();

    const form = useFormContext<VideoFormData>();
    const { formState: { errors } } = form;

    const currentEvent = event?.__typename === "AuthorizedEvent"
        ? {
            ...event,
            ...event.syncedData,
            seriesId: event.series?.id,
            seriesTitle: event.series?.title,
        }
        : undefined;

    return <EditModeForm create={create} save={save} map={(data: VideoFormData) => data}>
        <Heading>
            {t("video.singular")}
            {isRealUser(user) && !user.canFindUnlisted && <InfoTooltip
                info={t("manage.block.event.findable-events-note")}
            />}
        </Heading>
        {"event" in errors && <div css={{ margin: "8px 0" }}>
            <Card kind="error">{t("manage.block.event.invalid")}</Card>
        </div>}
        {event?.__typename === "NotAllowed" && <Card kind="error" css={{ margin: "8px 0" }}>
            {t("manage.block.event.no-read-access-to-current")}
        </Card>}
        <Controller
            defaultValue={currentEvent?.id}
            name="event"
            rules={{ required: true }}
            render={({ field: { onChange, onBlur } }) => (
                <EventSelector
                    defaultValue={currentEvent}
                    {...{ onBlur }}
                    onChange={selectedEvent => onChange(selectedEvent?.id)}
                />
            )}
        />
        <DisplayOptionGroup type="checkbox" {...{ form }} optionProps={[
            {
                option: "showTitle",
                title: t("manage.block.options.show-title"),
                checked: showTitle,
            },
            {
                option: "showLink",
                title: t("manage.block.options.show-link"),
                checked: showLink,
            },
        ]} />
    </EditModeForm>;
};

