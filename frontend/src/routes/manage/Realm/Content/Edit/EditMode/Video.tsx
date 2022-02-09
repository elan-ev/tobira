import React, { useContext, useImperativeHandle } from "react";
import { graphql, useFragment, useMutation } from "react-relay";
import { useTranslation } from "react-i18next";
import { useFormContext } from "react-hook-form";

import { bug } from "../../../../../../util/err";
import { Card } from "../../../../../../ui/Card";
import { Select } from "../../../../../../ui/Input";
import { ContentManageQueryContext } from "../..";
import type { EditModeRef, EditModeFormData } from ".";
import type { VideoEditModeBlockData$key } from "./__generated__/VideoEditModeBlockData.graphql";
import type { VideoEditModeEventData$key } from "./__generated__/VideoEditModeEventData.graphql";
import type { VideoEditSaveMutation } from "./__generated__/VideoEditSaveMutation.graphql";
import type { VideoEditCreateMutation } from "./__generated__/VideoEditCreateMutation.graphql";


export type VideoFormData = {
    event: string;
};

type EditVideoBlockProps = {
    block: VideoEditModeBlockData$key;
};

export const EditVideoBlock = React.forwardRef<EditModeRef, EditVideoBlockProps>(
    ({ block: blockRef }, ref) => {

        const { events } = useFragment(graphql`
            fragment VideoEditModeEventData on Query {
                events { id title }
            }
        `, useContext(ContentManageQueryContext) as VideoEditModeEventData$key);

        const { event: { id: event } } = useFragment(graphql`
            fragment VideoEditModeBlockData on VideoBlock {
                event { id }
            }
        `, blockRef);


        const [save] = useMutation<VideoEditSaveMutation>(graphql`
            mutation VideoEditSaveMutation($id: ID!, $set: UpdateVideoBlock!) {
                updateVideoBlock(id: $id, set: $set) {
                    ... BlocksBlockData
                    ... VideoBlockData
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

        useImperativeHandle(ref, () => ({
            save: (id, data, onCompleted, onError) => {
                const { type: _type, ...set } = data.type === "VideoBlock"
                    ? data
                    : bug("not a video block");

                save({
                    variables: { id, set },
                    onCompleted,
                    onError,
                });
            },
            create: (realm, index, data, onCompleted, onError) => {
                const { type: _type, ...block } = data.type === "VideoBlock"
                    ? data
                    : bug("not a video block");

                create({
                    variables: { realm, index, block },
                    onCompleted,
                    onError,
                });
            },
        }));


        const { t } = useTranslation();

        const form = useFormContext<EditModeFormData>();
        const { formState: { errors } } = form;

        return <div css={{ "& > h3": {
            marginTop: 8,
            marginBottom: 4,
        } }}>
            <h3>{t("manage.realm.content.event.event.heading")}</h3>
            {"event" in errors && <div css={{ margin: "8px 0" }}>
                <Card kind="error">{t("manage.realm.content.event.event.invalid")}</Card>
            </div>}
            <Select
                css={{ maxWidth: "100%" }}
                error={"event" in errors}
                defaultValue={event}
                {...form.register("event", { pattern: /^ev/ })}
            >
                {/* See the series block code for an explanation of this option */}
                <option value="clNOEVENT" hidden>
                    {t("manage.realm.content.event.event.dummy")}
                </option>
                {events.map(({ id, title }) => (
                    <option key={id} value={id}>{title}</option>
                ))}
            </Select>
        </div>;
    },
);
