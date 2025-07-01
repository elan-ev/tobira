import React from "react";
import { useTranslation } from "react-i18next";
import { graphql, useFragment, useMutation } from "react-relay";
import { Controller } from "react-hook-form";

import { EditModeError, EditModeForm } from ".";
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
import { VideoListSelector } from "../../../../../../ui/SearchableSelect";
import { InfoTooltip } from "../../../../../../ui";
import { isRealUser, useUser } from "../../../../../../User";


type SeriesFormData = {
    series: string;
    order: VideoListOrder;
    layout: VideoListLayout;
    displayOptions: {
        showTitle: boolean;
        showMetadata: boolean;
    };
};

type EditSeriesBlockProps = {
    block: SeriesEditModeBlockData$key;
};

export const EditSeriesBlock: React.FC<EditSeriesBlockProps> = ({ block: blockRef }) => {
    const { t } = useTranslation();
    const user = useUser();


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


    const map = (data: SeriesFormData) => data;

    const defaultValues = {
        series: series?.id ?? "",
        order,
        layout,
        displayOptions: {
            showTitle,
            showMetadata,
        },
    };


    return <EditModeForm {...{ defaultValues, map, save, create }}>
        <Heading>
            {t("series.singular")}
            {isRealUser(user) && !user.canFindUnlisted && <InfoTooltip
                info={t("manage.block.series.findable-series-note")}
            />}
        </Heading>
        <EditModeError blockType="series" />
        <Controller
            name="series"
            defaultValue={series?.id}
            rules={{ required: true }}
            render={({ field: { onChange, onBlur } }) => <VideoListSelector
                type="series"
                defaultValue={series ?? undefined}
                onChange={data => onChange(data?.id)}
                {...{ onBlur }}
            />}
        />
        <VideoListFormFields {...{ order, layout, showMetadata, showTitle }} />
    </EditModeForm>;
};
