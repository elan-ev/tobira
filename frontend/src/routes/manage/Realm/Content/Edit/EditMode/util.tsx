import React, { ReactNode, useId } from "react";
import { COLORS } from "../../../../../../color";
import { screenWidthAbove, screenWidthAtMost } from "@opencast/appkit";
import { BREAKPOINT_SMALL } from "../../../../../../GlobalStyle";
import { DisplayOptionGroup } from "../../../../../../ui/Input";
import { useTranslation } from "react-i18next";
import { FieldValues, UseFormReturn } from "react-hook-form";
import {
    VideoListLayout,
    VideoListOrder,
} from "../../../../../../ui/Blocks/__generated__/SeriesBlockData.graphql";


export const Heading: React.FC<{ id?: string; children: ReactNode }> = ({ id, children }) =>
    <h3 id={id} css={{
        ":not(:first-of-type)": { marginTop: 12 },
        marginBottom: 8,
        fontSize: 18,
    }}>
        {children}
    </h3>;


type NiceRadioProps = React.PropsWithChildren<{
    breakpoint: number;
}>;

/**
 * A form input element letting the user chose between different options.
 * `children` should be a list of `NiceRadioOption`.
 */
export const NiceRadio: React.FC<NiceRadioProps> = ({ children, breakpoint }) => (
    // Getting this styled with CSS is quite fiddly mainly due to border radius.
    <div css={{
        display: "inline-flex",
        [screenWidthAtMost(breakpoint)]: {
            flexDirection: "column",
        },

        "& > label": {
            "& > div": {
                border: `1px solid ${COLORS.neutral40}`,
                padding: "6px 12px",
                cursor: "pointer",
                backgroundColor: COLORS.neutral05,
            },
            "& > input:checked + div": {
                backgroundColor: COLORS.neutral10,
                outline: `2px solid ${COLORS.primary0}`,
                outlineOffset: -2,
                position: "relative", // Needed so that the outline is over sibling divs
            },
            // The attribute selector increases specificity
            ":focus-within div[role='button']": {
                backgroundColor: COLORS.neutral20,
                outline: `3px solid ${COLORS.primary0}`,
            },
            "& > input": {
                position: "absolute",
                opacity: 0, // Needed for the radio input to work for keyboard-only users
            },
            [screenWidthAtMost(breakpoint)]: {
                "&:first-child > div": {
                    borderRadius: "8px 8px 0 0",
                },
                "&:last-child > div": {
                    borderRadius: "0 0 8px 8px",
                },
                "&:not(:first-child) > div": {
                    marginTop: -1,
                },
            },
            [screenWidthAbove(breakpoint)]: {
                ":first-child > div": {
                    borderRadius: "8px 0 0 8px",
                },
                "&:last-child > div": {
                    borderRadius: "0 8px 8px 0",
                },
                "&:not(:first-child) > div": {
                    marginLeft: -1,
                },
            },
        },
    }}>{children}</div>
);



type NiceRadioOptionProps = React.PropsWithChildren<JSX.IntrinsicElements["input"]>;

export const NiceRadioOption = React.forwardRef<HTMLInputElement, NiceRadioOptionProps>(
    ({ children, ...rest }, ref) => (
        <label>
            <input type="radio" ref={ref} {...rest} />
            <div role="button">{children}</div>
        </label>
    ),
);

type VideoListFormFieldProps<TFieldValues extends FieldValues> = {
    form: UseFormReturn<TFieldValues>;
    order: VideoListOrder;
    layout: VideoListLayout;
    showTitle: boolean;
    showMetadata: boolean;
    allowOriginalOrder?: boolean;
}

export function VideoListFormFields<TFieldValues extends FieldValues>({
    form,
    order,
    layout,
    showTitle,
    showMetadata,
    allowOriginalOrder,
}: VideoListFormFieldProps<TFieldValues>) {
    const { t } = useTranslation();
    const headingId = useId();
    const optionProps = [
        {
            option: "order",
            title: t("video-list-block.settings.new-to-old"),
            checked: order === "NEW_TO_OLD",
            value: "NEW_TO_OLD",
        },
        {
            option: "order",
            title: t("video-list-block.settings.old-to-new"),
            checked: order === "OLD_TO_NEW",
            value: "OLD_TO_NEW",
        },
        {
            option: "order",
            title: t("video-list-block.settings.a-z"),
            checked: order === "AZ",
            value: "AZ",
        },
        {
            option: "order",
            title: t("video-list-block.settings.z-a"),
            checked: order === "ZA",
            value: "ZA",
        },
    ];
    if (allowOriginalOrder) {
        optionProps.unshift({
            option: "order",
            title: t("video-list-block.settings.original"),
            checked: order === "ORIGINAL",
            value: "ORIGINAL",
        });
    }

    return (
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
                <Heading id={headingId + "-order"}>{t("video-list-block.settings.order")}</Heading>
                <DisplayOptionGroup type="radio" {...{ form, optionProps }} />
            </div>
            <div
                role="group"
                aria-labelledby={headingId + "-view"}
            >
                <Heading id={headingId + "-view"}>{t("video-list-block.settings.layout")}</Heading>
                <DisplayOptionGroup type="radio" {...{ form }} optionProps={[
                    {
                        option: "layout",
                        title: t("video-list-block.settings.slider"),
                        checked: layout === "SLIDER",
                        value: "SLIDER",
                    },
                    {
                        option: "layout",
                        title: t("video-list-block.settings.gallery"),
                        checked: layout === "GALLERY",
                        value: "GALLERY",
                    },
                    {
                        option: "layout",
                        title: t("video-list-block.settings.list"),
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
                    {t("manage.block.metadata")}
                </Heading>
                <DisplayOptionGroup type="checkbox" {...{ form }} optionProps={[
                    {
                        option: "showTitle",
                        title: t("manage.block.options.show-title"),
                        checked: showTitle,
                    },
                    {
                        option: "showMetadata",
                        title: t("manage.block.options.show-description"),
                        checked: showMetadata,
                    },
                ]} />
            </div>
        </div>
    );
}

