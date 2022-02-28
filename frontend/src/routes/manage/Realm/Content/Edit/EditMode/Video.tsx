import React, { useContext } from "react";
import { graphql, useFragment, useMutation } from "react-relay";
import { useTranslation } from "react-i18next";
import { useFormContext } from "react-hook-form";

import { Card } from "../../../../../../ui/Card";
import { Select } from "../../../../../../ui/Input";
import { ContentManageQueryContext } from "../..";
import { EditModeForm } from ".";
import { Heading, ShowTitle } from "./util";
import type { VideoEditModeBlockData$key } from "./__generated__/VideoEditModeBlockData.graphql";
import type { VideoEditModeEventData$key } from "./__generated__/VideoEditModeEventData.graphql";
import type { VideoEditSaveMutation } from "./__generated__/VideoEditSaveMutation.graphql";
import type { VideoEditCreateMutation } from "./__generated__/VideoEditCreateMutation.graphql";


type VideoFormData = {
    event: string;
};

type EditVideoBlockProps = {
    block: VideoEditModeBlockData$key;
};

export const EditVideoBlock: React.FC<EditVideoBlockProps> = ({ block: blockRef }) => {

    const { events } = useFragment(graphql`
        fragment VideoEditModeEventData on Query {
            events { id title }
        }
    `, useContext(ContentManageQueryContext) as VideoEditModeEventData$key);

    const { event, showTitle } = useFragment(graphql`
        fragment VideoEditModeBlockData on VideoBlock {
            event { id }
            showTitle
        }
    `, blockRef);


    const [save] = useMutation<VideoEditSaveMutation>(graphql`
        mutation VideoEditSaveMutation($id: ID!, $set: UpdateVideoBlock!) {
            updateVideoBlock(id: $id, set: $set) {
                ... BlocksBlockData
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

    const form = useFormContext<VideoFormData>();
    const { formState: { errors } } = form;

    return <EditModeForm create={create} save={save}>
        <Heading>{t("manage.realm.content.event.event.heading")}</Heading>
        {"event" in errors && <div css={{ margin: "8px 0" }}>
            <Card kind="error">{t("manage.realm.content.event.event.invalid")}</Card>
        </div>}
        <Select
            css={{ maxWidth: "100%" }}
            error={"event" in errors}
            defaultValue={event?.id}
            {...form.register("event", { required: true })}
        >
            <option value="" hidden>
                {t("manage.realm.content.event.event.none")}
            </option>
            {events.map(({ id, title }) => (
                <option key={id} value={id}>{title}</option>
            ))}
        </Select>
        <ShowTitle showTitle={showTitle} />
    </EditModeForm>;
};
