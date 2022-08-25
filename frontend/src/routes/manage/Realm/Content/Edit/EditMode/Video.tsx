import React, { useContext } from "react";
import { graphql, useFragment, useMutation } from "react-relay";
import { useTranslation } from "react-i18next";
import { useFormContext } from "react-hook-form";

import { Card } from "../../../../../../ui/Card";
import { Select } from "../../../../../../ui/Input";
import { ContentManageQueryContext } from "../..";
import { EditModeForm } from ".";
import { Heading } from "./util";
import type { VideoEditModeBlockData$key } from "./__generated__/VideoEditModeBlockData.graphql";
import type { VideoEditModeEventData$key } from "./__generated__/VideoEditModeEventData.graphql";
import type { VideoEditSaveMutation } from "./__generated__/VideoEditSaveMutation.graphql";
import type { VideoEditCreateMutation } from "./__generated__/VideoEditCreateMutation.graphql";


type VideoFormData = {
    event: string;
    showTitle: boolean;
};

type EditVideoBlockProps = {
    block: VideoEditModeBlockData$key;
};

export const EditVideoBlock: React.FC<EditVideoBlockProps> = ({ block: blockRef }) => {

    const { events } = useFragment(graphql`
        fragment VideoEditModeEventData on Query {
            events: allEvents { id title }
        }
    `, useContext(ContentManageQueryContext) as VideoEditModeEventData$key);

    const { event, showTitle } = useFragment(graphql`
        fragment VideoEditModeBlockData on VideoBlock {
            event {
                __typename,
                ... on NotAllowed { dummy }
                ... on AuthorizedEvent { id }
            }
            showTitle
        }
    `, blockRef);


    const [save] = useMutation<VideoEditSaveMutation>(graphql`
        mutation VideoEditSaveMutation($id: ID!, $set: UpdateVideoBlock!) {
            updateVideoBlock(id: $id, set: $set) {
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

    const form = useFormContext<VideoFormData>();
    const { formState: { errors } } = form;

    return <EditModeForm create={create} save={save} map={(data: VideoFormData) => data}>
        <Heading>{t("manage.realm.content.event.event.heading")}</Heading>
        {"event" in errors && <div css={{ margin: "8px 0" }}>
            <Card kind="error">{t("manage.realm.content.event.event.invalid")}</Card>
        </div>}
        {event?.__typename === "NotAllowed" && <Card kind="error" css={{ margin: "8px 0" }}>
            {t("manage.realm.content.event.event.no-read-acccess-to-current")}
        </Card>}
        <Select
            css={{ maxWidth: "100%" }}
            error={"event" in errors}
            defaultValue={event?.__typename === "AuthorizedEvent" ? event.id : undefined}
            {...form.register("event", { required: true })}
        >
            <option value="" hidden>
                {t("manage.realm.content.event.event.none")}
            </option>
            {events.map(({ id, title }) => (
                <option key={id} value={id}>{title}</option>
            ))}
        </Select>

        <Heading>{t("manage.realm.content.titled.title")}</Heading>
        <label>
            <input type="checkbox" defaultChecked={showTitle} {...form.register("showTitle")} />
            {t("manage.realm.content.titled.show-title")}
        </label>
    </EditModeForm>;
};
