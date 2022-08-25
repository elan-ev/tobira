import React, { useContext } from "react";
import { useTranslation } from "react-i18next";
import { graphql, useFragment, useMutation } from "react-relay";
import { useFormContext, UseFormReturn } from "react-hook-form";

import { isSynced, match } from "../../../../../../util";
import { Card } from "../../../../../../ui/Card";
import { Select } from "../../../../../../ui/Input";
import { ContentManageQueryContext } from "../..";
import { EditModeForm } from ".";
import { Heading, NiceRadio, NiceRadioOption } from "./util";
import type {
    VideoListOrder,
    SeriesEditModeBlockData$key,
} from "./__generated__/SeriesEditModeBlockData.graphql";
import {
    SeriesEditModeSeriesData$key,
} from "./__generated__/SeriesEditModeSeriesData.graphql";
import {
    SeriesEditSaveMutation,
} from "./__generated__/SeriesEditSaveMutation.graphql";
import {
    SeriesEditCreateMutation,
} from "./__generated__/SeriesEditCreateMutation.graphql";
import { BREAKPOINT_MEDIUM } from "../../../../../../GlobalStyle";


type SeriesFormData = {
    series: string;
    order: VideoListOrder;
    layout: Layout;
};

type Layout = "videos-only" | "title-and-videos" | "description-and-videos" | "everything";

type EditSeriesBlockProps = {
    block: SeriesEditModeBlockData$key;
};

export const EditSeriesBlock: React.FC<EditSeriesBlockProps> = ({ block: blockRef }) => {

    const { allSeries } = useFragment(graphql`
        fragment SeriesEditModeSeriesData on Query {
            allSeries {
                id
                title
                syncedData {
                    # only queried to see wether syncedData is null
                    description
                }
            }
        }
    `, useContext(ContentManageQueryContext) as SeriesEditModeSeriesData$key);

    const { series, showTitle, showMetadata, order } = useFragment(graphql`
        fragment SeriesEditModeBlockData on SeriesBlock {
            series {
                id
                title
                syncedData {
                    # only queried to see wether syncedData is null
                    description
                }
            }
            showTitle
            showMetadata
            order
        }
    `, blockRef);
    const currentLayout: Layout = showTitle
        ? (showMetadata ? "everything" : "title-and-videos")
        : (showMetadata ? "description-and-videos" : "videos-only");


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

    const mapFormData = ({ layout, order, series }: SeriesFormData) => {
        const [showTitle, showMetadata] = match(layout, {
            "videos-only": () => [false, false],
            "title-and-videos": () => [true, false],
            "description-and-videos": () => [false, true],
            "everything": () => [true, true],
        });

        return { series, order, showTitle, showMetadata };
    };

    const { t } = useTranslation();

    const form = useFormContext<SeriesFormData>();
    const { formState: { errors } } = form;

    return <EditModeForm create={create} save={save} map={mapFormData}>
        <Heading>{t("manage.realm.content.series.order.heading")}</Heading>
        <NiceRadio breakpoint={0}>
            <NiceRadioOption
                value="NEW_TO_OLD"
                defaultChecked={order === "NEW_TO_OLD"}
                {...form.register("order")}
            >{t("manage.realm.content.series.order.new-to-old")}</NiceRadioOption>
            <NiceRadioOption
                value="OLD_TO_NEW"
                defaultChecked={order === "OLD_TO_NEW"}
                {...form.register("order")}
            >{t("manage.realm.content.series.order.old-to-new")}</NiceRadioOption>
        </NiceRadio>

        <Heading>{t("manage.realm.content.series.series.heading")}</Heading>
        {"series" in errors && <div css={{ margin: "8px 0" }}>
            <Card kind="error">{t("manage.realm.content.series.series.invalid")}</Card>
        </div>}
        <Select
            css={{ maxWidth: "100%" }}
            error={"series" in errors}
            defaultValue={series?.id}
            {...form.register("series", { required: true })}
        >
            <option value="" hidden>
                {t("manage.realm.content.series.series.none")}
            </option>
            {series && series.syncedData === null && <option value={series.id} hidden>
                {t("manage.realm.content.series.series.waiting")}
            </option>}
            {allSeries
                .filter(isSynced)
                .map(({ id, title }) => (
                    <option key={id} value={id}>{title}</option>
                ))}
        </Select>
        <Heading>{t("manage.realm.content.series.layout.heading")}</Heading>
        <LayoutChooser {...{ currentLayout, form }} />
    </EditModeForm>;
};

type LayoutChooserProps = {
    currentLayout: Layout;
    form: UseFormReturn<SeriesFormData>;
};

const LayoutChooser: React.FC<LayoutChooserProps> = ({ currentLayout, form }) => {
    const { t } = useTranslation();
    const inputProps = (layout: Layout) => ({
        value: layout,
        defaultChecked: currentLayout === layout,
        ...form.register("layout"),
    });

    return (
        <NiceRadio breakpoint={BREAKPOINT_MEDIUM}>
            <NiceRadioOption {...inputProps("videos-only")}>
                {t("manage.realm.content.series.layout.videos-only")}
            </NiceRadioOption>
            <NiceRadioOption {...inputProps("title-and-videos")}>
                {t("manage.realm.content.series.layout.title-and-videos")}
            </NiceRadioOption>
            <NiceRadioOption {...inputProps("description-and-videos")}>
                {t("manage.realm.content.series.layout.description-and-videos")}
            </NiceRadioOption>
            <NiceRadioOption {...inputProps("everything")}>
                {t("manage.realm.content.series.layout.everything")}
            </NiceRadioOption>
        </NiceRadio>
    );
};
