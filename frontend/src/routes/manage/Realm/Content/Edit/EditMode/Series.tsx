import React, { useId } from "react";
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
    const user = useUser();

    const form = useFormContext<SeriesFormData>();
    const { formState: { errors }, control } = form;
    const { field: seriesField } = useController({
        defaultValue: series?.id,
        name: "series",
        control,
        rules: { required: true },
    });

    const headingId = useId();

    return <EditModeForm create={create} save={save} map={(data: SeriesFormData) => data}>
        <Heading>
            {t("manage.realm.content.series.series.heading")}
            {isRealUser(user) && !user.canFindUnlisted && <InfoTooltip
                info={t("manage.realm.content.series.series.findable-series-note")}
            />}
        </Heading>
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
            autoFocus
        />
        <div
            css={{
                display: "flex",
                flexDirection: "row",
                flexWrap: "wrap",
                marginTop: 12,
                justifyContent: "start",
                rowGap: 24,
                columnGap: 96,
                [screenWidthAtMost(1000)]: {
                    columnGap: 48,
                },
                [screenWidthAtMost(BREAKPOINT_SMALL)]: {
                    flexDirection: "column",
                    gap: 12,
                },
            }}
        >
            <div
                role="group"
                aria-labelledby={headingId + "-order"}
            >
                <Heading id={headingId + "-order"}>{t("series.settings.order")}</Heading>
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
            <div
                role="group"
                aria-labelledby={headingId + "-view"}
            >
                <Heading id={headingId + "-view"}>{t("series.settings.layout")}</Heading>
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
            <div
                role="group"
                aria-labelledby={headingId + "-metadata"}
            >
                <Heading id={headingId + "-metadata"}>
                    {t("manage.realm.content.series.metadata.heading")}
                </Heading>
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
