import React, { useContext } from "react";
import { useTranslation } from "react-i18next";
import { graphql, useFragment, useMutation } from "react-relay";
import { useFormContext } from "react-hook-form";

import { isSynced } from "../../../../../../util";
import { Card } from "../../../../../../ui/Card";
import { Select } from "../../../../../../ui/Input";
import { ContentManageQueryContext } from "../..";
import { EditModeForm } from ".";
import { Heading, ShowTitle } from "./util";
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


type SeriesFormData = {
    series: string;
    order: VideoListOrder;
};

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

    const { series, showTitle, order } = useFragment(graphql`
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
            order
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
    const { formState: { errors } } = form;

    return <EditModeForm create={create} save={save}>
        <Heading>{t("manage.realm.content.series.order.heading")}</Heading>
        <label>
            <input
                type="radio"
                value="NEW_TO_OLD"
                defaultChecked={order === "NEW_TO_OLD"}
                {...form.register("order")}
            />
            {t("manage.realm.content.series.order.new-to-old")}
        </label><br />
        <label>
            <input
                type="radio"
                value="OLD_TO_NEW"
                defaultChecked={order === "OLD_TO_NEW"}
                {...form.register("order")}
            />
            {t("manage.realm.content.series.order.old-to-new")}
        </label>

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
            {series && series.syncedData && <option value={series.id} hidden>
                {t("manage.realm.content.series.series.waiting")}
            </option>}
            {allSeries
                .filter(isSynced)
                .map(({ id, title }) => (
                    <option key={id} value={id}>{title}</option>
                ))}
        </Select>
        <ShowTitle showTitle={showTitle} />
    </EditModeForm>;
};
