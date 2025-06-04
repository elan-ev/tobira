import React from "react";
import { useTranslation } from "react-i18next";
import { graphql, useFragment, useMutation } from "react-relay";
import { useController, useFormContext } from "react-hook-form";

import { EditModeForm } from ".";
import { Heading, VideoListFormFields } from "./util";
import type {
    VideoListOrder,
    VideoListLayout,
    SeriesEditModeBlockData$key,
} from "./__generated__/SeriesEditModeBlockData.graphql";
import {
    SeriesEditSaveMutation,
} from "./__generated__/SeriesEditSaveMutation.graphql";
import {
    SeriesEditCreateMutation,
} from "./__generated__/SeriesEditCreateMutation.graphql";
import { Card } from "@opencast/appkit";
import { VideoListSelector } from "../../../../../../ui/SearchableSelect";
import { InfoTooltip } from "../../../../../../ui";
import { isRealUser, useUser } from "../../../../../../User";


type SeriesFormData = {
    series: string;
    order: VideoListOrder;
    layout: VideoListLayout;
    showTitle: boolean;
    showMetadata: boolean;
};

type EditSeriesBlockProps = {
    block: SeriesEditModeBlockData$key;
};

export const EditSeriesBlock: React.FC<EditSeriesBlockProps> = ({ block: blockRef }) => {
    const { series, showTitle, showMetadata, order, layout } = useFragment(graphql`
        fragment SeriesEditModeBlockData on SeriesBlock {
            series {
                id
                opencastId
                title
                state
                description
            }
            showTitle
            showMetadata
            order
            layout
        }
    `, blockRef);

    const [save] = useMutation<SeriesEditSaveMutation>(graphql`
        mutation SeriesEditSaveMutation($id: ID!, $set: UpdateSeriesBlock!) {
            updateSeriesBlock(id: $id, set: $set) {
                ... BlocksBlockData
                ... EditBlockUpdateRealmNameData
            }
        }
    `);

    const [create] = useMutation<SeriesEditCreateMutation>(graphql`
        mutation SeriesEditCreateMutation($realm: ID!, $index: Int!, $block: NewSeriesBlock!) {
            addSeriesBlock(realm: $realm, index: $index, block: $block) {
                ... ContentManageRealmData
            }
        }
    `);

    const { t } = useTranslation();
    const user = useUser();

    const form = useFormContext<SeriesFormData>();
    const { formState: { errors }, control } = form;
    const { field: seriesField } = useController({
        defaultValue: series?.id,
        name: "series",
        control,
        rules: { required: true },
    });

    return <EditModeForm create={create} save={save} map={(data: SeriesFormData) => data}>
        <Heading>
            {t("series.singular")}
            {isRealUser(user) && !user.canFindUnlisted && <InfoTooltip
                info={t("manage.block.series.findable-series-note")}
            />}
        </Heading>
        {"series" in errors && <div css={{ margin: "8px 0" }}>
            <Card kind="error">{t("manage.block.series.invalid")}</Card>
        </div>}
        <VideoListSelector
            type="series"
            defaultValue={series == null ? undefined : series}
            onChange={data => seriesField.onChange(data?.id)}
            onBlur={seriesField.onBlur}
            autoFocus
        />
        <VideoListFormFields {...{ form, order, layout, showMetadata, showTitle }} />
    </EditModeForm>;
};
