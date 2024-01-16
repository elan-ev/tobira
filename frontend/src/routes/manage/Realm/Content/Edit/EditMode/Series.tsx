import React from "react";
import { useTranslation } from "react-i18next";
import { graphql, useFragment, useMutation } from "react-relay";
import { useController, useFormContext } from "react-hook-form";

import { Card } from "../../../../../../ui/Card";
import { EditModeForm } from ".";
import { Heading } from "./util";
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
import { SeriesSelector } from "../../../../../../ui/SearchableSelect";
import { DisplayOptionGroup } from "../../../../../../ui/Input";
import { screenWidthAtMost } from "@opencast/appkit";
import { BREAKPOINT_SMALL } from "../../../../../../GlobalStyle";


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
                syncedData {
                    # only queried to see whether syncedData is null
                    description
                }
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

    const form = useFormContext<SeriesFormData>();
    const { formState: { errors }, control } = form;
    const { field: seriesField } = useController({
        defaultValue: series?.id,
        name: "series",
        control,
        rules: { required: true },
    });

    return <EditModeForm create={create} save={save} map={(data: SeriesFormData) => data}>
        <Heading>{t("manage.realm.content.series.series.heading")}</Heading>
        {"series" in errors && <div css={{ margin: "8px 0" }}>
            <Card kind="error">{t("manage.realm.content.series.series.invalid")}</Card>
        </div>}
        <SeriesSelector
            defaultValue={series == null ? undefined : {
                ...series,
                description: series.syncedData?.description ?? null,
            }}
            onChange={data => seriesField.onChange(data?.id)}
            onBlur={seriesField.onBlur}
        />
        <div
            role="group"
            aria-label={t("manage.realm.content.display-options")}
            css={{
                display: "flex",
                flexDirection: "row",
                flexWrap: "wrap",
                marginTop: 12,
                justifyContent: "start",
                rowGap: 12,
                columnGap: 36,
                [screenWidthAtMost(BREAKPOINT_SMALL)]: {
                    flexDirection: "column",
                    gap: 12,
                },
            }}
        >
            <div>
                <Heading>{t("series.settings.order")}</Heading>
                <DisplayOptionGroup type="radio" {...{ form }} optionProps={[
                    {
                        option: "order",
                        title: t("series.settings.new-to-old"),
                        checked: order === "NEW_TO_OLD",
                        value: "NEW_TO_OLD",
                    },
                    {
                        option: "order",
                        title: t("series.settings.old-to-new"),
                        checked: order === "OLD_TO_NEW",
                        value: "OLD_TO_NEW",
                    },
                    {
                        option: "order",
                        title: t("series.settings.a-z"),
                        checked: order === "AZ",
                        value: "AZ",
                    },
                    {
                        option: "order",
                        title: t("series.settings.z-a"),
                        checked: order === "ZA",
                        value: "ZA",
                    },
                ]} />
            </div>
            <div>
                <Heading>{t("series.settings.layout")}</Heading>
                <DisplayOptionGroup type="radio" {...{ form }} optionProps={[
                    {
                        option: "layout",
                        title: t("series.settings.slider"),
                        checked: layout === "SLIDER",
                        value: "SLIDER",
                    },
                    {
                        option: "layout",
                        title: t("series.settings.gallery"),
                        checked: layout === "GALLERY",
                        value: "GALLERY",
                    },
                    {
                        option: "layout",
                        title: t("series.settings.list"),
                        checked: layout === "LIST",
                        value: "LIST",
                    },
                ]} />
            </div>
            <div>
                <Heading>{t("manage.realm.content.series.layout.heading")}</Heading>
                <DisplayOptionGroup type="checkbox" {...{ form }} optionProps={[
                    {
                        option: "showTitle",
                        title: t("manage.realm.content.show-title"),
                        checked: showTitle,
                    },
                    {
                        option: "showMetadata",
                        title: t("manage.realm.content.show-description"),
                        checked: showMetadata,
                    },
                ]} />
            </div>
        </div>
    </EditModeForm>;
};
