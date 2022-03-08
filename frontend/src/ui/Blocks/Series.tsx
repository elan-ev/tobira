import React from "react";
import { graphql, useFragment } from "react-relay";

import { keyOfId } from "../../util";
import { Link } from "../../router";
import { SeriesBlockData, SeriesBlockData$key } from "./__generated__/SeriesBlockData.graphql";
import {
    SeriesBlockSeriesData,
    SeriesBlockSeriesData$key,
} from "./__generated__/SeriesBlockSeriesData.graphql";
import { Thumbnail } from "../Video";
import { RelativeDate } from "../time";
import { Card } from "../Card";
import { useTranslation } from "react-i18next";


type SharedProps = {
    title?: string;
    realmPath: string;
    activeEventId?: string;
};

const blockFragment = graphql`
    fragment SeriesBlockData on SeriesBlock {
        series { ...SeriesBlockSeriesData }
        showTitle
        layout
        order
    }
`;

const seriesFragment = graphql`
    fragment SeriesBlockSeriesData on Series {
        title
        events {
            id
            title
            thumbnail
            duration
            created
            creator
            tracks { resolution }
        }
    }
`;

type FromBlockProps = SharedProps & {
    fragRef: SeriesBlockData$key;
};

export const SeriesBlockFromBlock: React.FC<FromBlockProps> = ({ fragRef, ...rest }) => {
    const { t } = useTranslation();
    const { series, ...block } = useFragment(blockFragment, fragRef);
    return series === null
        ? <Card kind="error">{t("series.deleted-series-block")}</Card>
        : <SeriesBlockFromSeries fragRef={series} {...rest} {...block} />;
};

type BlockOnlyProps = Omit<NonNullable<SeriesBlockData>, "series" | " $fragmentType">;

type FromSeriesProps = SharedProps & {
    fragRef: SeriesBlockSeriesData$key;
} & Partial<BlockOnlyProps>;

export const SeriesBlockFromSeries: React.FC<FromSeriesProps> = ({ fragRef, ...rest }) => {
    const series = useFragment(seriesFragment, fragRef);
    return <SeriesBlock
        {...{ series }}
        layout="GRID"
        order="NEW_TO_OLD"
        showTitle={true}
        {...rest}
    />;
};

type Props = SharedProps & BlockOnlyProps & {
    series: NonNullable<SeriesBlockSeriesData>;
};

const VIDEO_GRID_BREAKPOINT = 600;

export const SeriesBlock: React.FC<Props> = ({
    title,
    series,
    showTitle,
    realmPath,
    activeEventId,
}) => (
    <div css={{
        marginTop: 24,
        padding: 12,
        paddingTop: 0,
        backgroundColor: "var(--grey95)",
        borderRadius: 10,
    }}>
        {/* This is a way to make this fancy title. It's not perfect, but it works fine. */}
        {(title || showTitle) && <div css={{ maxHeight: 50 }}>
            <h2 title={title ?? series.title} css={{
                backgroundColor: "var(--accent-color)",
                color: "white",
                padding: "4px 12px",
                borderRadius: 10,
                transform: "translateY(-50%)",
                fontSize: 19,
                margin: "0 8px",

                display: "-webkit-inline-box",
                WebkitBoxOrient: "vertical",
                textOverflow: "ellipsis",
                WebkitLineClamp: 3,
                overflow: "hidden",
                lineHeight: 1.3,
            }}>{title ?? series.title}</h2>
        </div>}
        <div css={{
            display: "flex",
            flexWrap: "wrap",
            [`@media (max-width: ${VIDEO_GRID_BREAKPOINT}px)`]: {
                justifyContent: "center",
            },
        }}>
            {series.events.map(event => <GridTile
                key={event.id}
                active={event.id === activeEventId}
                {...{ realmPath, event }}
            />)}
        </div>
    </div>
);

type GridTypeProps = {
    realmPath: string;
    event: NonNullable<SeriesBlockSeriesData>["events"][0];
    active: boolean;
};

const GridTile: React.FC<GridTypeProps> = ({ event, realmPath, active }) => {
    const TRANSITION_DURATION = "0.3s";

    const inner = <>
        <div css={{ borderRadius: 8 }}>
            <Thumbnail event={event} active={active} />
            <div css={{
                position: "absolute",
                top: 0,
                height: "100%",
                width: "100%",
                overflow: "hidden",
            }}>
                <div css={{
                    background: "linear-gradient(to top, white, rgba(255, 255, 255, 0.1))",
                    height: 90,
                    transition: `transform ${TRANSITION_DURATION}, opacity ${TRANSITION_DURATION}`,
                    opacity: 0.1,
                    filter: "blur(3px)",
                    transformOrigin: "bottom right",
                    transform: "translateY(-60px) rotate(30deg)",
                }} />
            </div>
        </div>
        <div css={{
            margin: "0px 4px",
            marginTop: 12,
            color: "black",
        }}>
            <h3 css={{
                fontSize: "inherit",
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                textOverflow: "ellipsis",
                WebkitLineClamp: 2,
                overflow: "hidden",
                lineHeight: 1.3,
                marginBottom: 4,
            }}>{event.title}</h3>
            <div css={{
                color: "var(--grey40)",
                fontSize: 14,
                display: "flex",
                flexWrap: "wrap",
                "& > span": {
                    display: "inline-block",
                    whiteSpace: "nowrap",
                },
            }}>
                {event.creator != null && <span css={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    "&:after": {
                        content: "'•'",
                        padding: "0 8px",
                    },
                }}>{event.creator}</span>}
                {/* `new Date` is well defined for our ISO Date strings */}
                <RelativeDate date={new Date(event.created)} />
            </div>
        </div>
    </>;

    const containerStyle = {
        position: "relative",
        display: "block",
        margin: 8,
        marginBottom: 32,
        width: 16 * 15,
        borderRadius: 8,
        "& a": { color: "black", textDecoration: "none" },
        [`@media (max-width: ${VIDEO_GRID_BREAKPOINT}px)`]: {
            width: "100%",
            maxWidth: 360,
        },
        ...!active && {
            "& > div:first-child": {
                transition: `transform ${TRANSITION_DURATION}, box-shadow ${TRANSITION_DURATION}`,
            },
            "&:hover > div:first-child, &:focus-visible > div:first-child": {
                boxShadow: "0 6px 10px rgb(0 0 0 / 40%)",
                transform: "perspective(500px) rotateX(7deg) scale(1.05)",
                "& > div:nth-child(2) > div": {
                    opacity: 0.2,
                    transform: "rotate(30deg)",
                },
            },
            "&:focus-visible": {
                outline: "none",
                boxShadow: "0 0 0 2px var(--accent-color)",
            },
        },
    } as const;

    return active
        ? <div css={{ ...containerStyle, display: "inline-block" }}>{inner}</div>
        : <Link
            to={`${realmPath}${realmPath.endsWith("/") ? "" : "/"}v/${keyOfId(event.id)}`}
            css={containerStyle}
        >{inner}</Link>;
};

