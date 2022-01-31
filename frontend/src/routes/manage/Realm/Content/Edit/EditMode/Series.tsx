import React, { useContext, useImperativeHandle } from "react";
import { useTranslation } from "react-i18next";
import { graphql, useFragment, useMutation } from "react-relay";
import { useFormContext } from "react-hook-form";

import type {
    VideoListOrder,
    VideoListLayout,
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
import { bug } from "../../../../../../util/err";
import { Card } from "../../../../../../ui/Card";
import { Select } from "../../../../../../ui/Input";
import { ContentManageQueryContext } from "../..";
import type { EditModeRef, EditModeFormData } from ".";


export type SeriesFormData = {
    series: string;
    order: VideoListOrder;
    layout: VideoListLayout;
};

type EditSeriesBlockProps = {
    block: SeriesEditModeBlockData$key;
};

export const EditSeriesBlock = React.forwardRef<EditModeRef, EditSeriesBlockProps>(
    ({ block: blockRef }, ref) => {
        const { t } = useTranslation();


        const { series: allSeries } = useFragment(graphql`
            fragment SeriesEditModeSeriesData on Query {
                series { id title }
            }
        `, useContext(ContentManageQueryContext) as SeriesEditModeSeriesData$key);

        const { order, layout, series: { id: series } } = useFragment(graphql`
            fragment SeriesEditModeBlockData on SeriesBlock {
                order
                layout
                series { id }
            }
        `, blockRef);


        const form = useFormContext<EditModeFormData>();
        const { formState: { errors } } = form;


        const [save] = useMutation<SeriesEditSaveMutation>(graphql`
            mutation SeriesEditSaveMutation($id: ID!, $set: UpdateSeriesBlock!) {
                updateSeriesBlock(id: $id, set: $set) {
                    ... BlocksBlockData
                    ... SeriesBlockData
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

        useImperativeHandle(ref, () => ({
            save: (id, data, onCompleted, onError) => {
                const { type: _type, ...set } = data.type === "SeriesBlock"
                    ? data
                    : bug("not a series block");

                save({
                    variables: {
                        id,
                        set,
                    },
                    onCompleted,
                    onError,
                });
            },
            create: (realm, index, data, onCompleted, onError) => {
                const { type: _type, ...block } = data.type === "SeriesBlock"
                    ? data
                    : bug("not a series block");

                create({
                    variables: {
                        realm,
                        index,
                        block,
                    },
                    onCompleted,
                    onError,
                });
            },
        }));


        return <div css={{ "& > h3": {
            marginTop: 8,
            marginBottom: 4,
        } }}>
            <h3>{t("manage.realm.content.series.order.heading")}</h3>
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

            <h3>{t("manage.realm.content.series.layout.heading")}</h3>
            <label>
                <input
                    type="radio"
                    value="GRID"
                    defaultChecked={layout === "GRID"}
                    {...form.register("layout")}
                />
                {t("manage.realm.content.series.layout.grid")}
            </label><br />
            <label>
                <input
                    type="radio"
                    value="HORIZONTAL"
                    defaultChecked={layout === "HORIZONTAL"}
                    {...form.register("layout")}
                />
                {t("manage.realm.content.series.layout.horizontal")}
            </label><br />
            <label>
                <input
                    type="radio"
                    value="VERTICAL"
                    defaultChecked={layout === "VERTICAL"}
                    {...form.register("layout")}
                />
                {t("manage.realm.content.series.layout.vertical")}
            </label>

            <h3>{t("manage.realm.content.series.series.heading")}</h3>
            {"series" in errors && <div css={{ margin: "8px 0" }}>
                <Card kind="error">{t("manage.realm.content.series.series.invalid")}</Card>
            </div>}
            <Select
                css={{ maxWidth: "100%" }}
                error={"series" in errors}
                defaultValue={series}
                {...form.register("series", { pattern: /^sr/ })}
            >
                {/*
                    This is a bit of a hack.
                    This first option should only be visible for new series blocks.
                    Contrary to the GraphQL schema which this component is based on,
                    these blocks don't have a series assigned, yet.
                    To not duplicate and/or confuse the functionality
                    and usage of this component,
                    we therefore just assign them a dummy series.
                    Note that there is no direct validation
                    for this dummy series to be selected;
                    however, trying to save a new block with it will fail in the backend,
                    and thus trigger the block-level error handling mechanism.
                */}
                <option value="clNOSERIES" hidden>
                    {t("manage.realm.content.series.series.dummy")}
                </option>
                {allSeries.map(({ id, title }) => (
                    <option key={id} value={id}>{title}</option>
                ))}
            </Select>
        </div>;
    },
);
