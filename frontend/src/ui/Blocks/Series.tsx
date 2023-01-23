import React, { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { graphql, useFragment } from "react-relay";

import { keyOfId, compareByKey, swap, isSynced, SyncedOpencastEntity } from "../../util";
import { match } from "../../util";
import { unreachable } from "../../util/err";
import type { Fields } from "../../relay";
import { Link } from "../../router";
import { SeriesBlockData$data, SeriesBlockData$key } from "./__generated__/SeriesBlockData.graphql";
import {
    SeriesBlockSeriesData$data,
    SeriesBlockSeriesData$key,
} from "./__generated__/SeriesBlockSeriesData.graphql";
import { isPastLiveEvent, Thumbnail } from "../Video";
import { RelativeDate } from "../time";
import { Card } from "../Card";
import { FiPlay } from "react-icons/fi";
import { keyframes } from "@emotion/react";
import { Description } from "../metadata";
import { ellipsisOverflowCss } from "..";


type SharedProps = {
    basePath: string;
};

const blockFragment = graphql`
    fragment SeriesBlockData on SeriesBlock {
        series {
            ...SeriesBlockSeriesData
        }
        showTitle
        showMetadata
        order
    }
`;

const seriesFragment = graphql`
    fragment SeriesBlockSeriesData on Series {
        title
        # description is only queried to get the sync status
        syncedData { description }
        events {
            id
            title
            created
            creators
            isLive
            syncedData {
                duration
                thumbnail
                startTime
                endTime
                tracks { resolution }
            }
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

type BlockProps = Partial<Omit<Fields<SeriesBlockData$data>, "series">>;

type SharedFromSeriesProps = SharedProps & BlockProps & {
    title?: string;
    activeEventId?: string;
};

type FromSeriesProps = SharedFromSeriesProps & {
    fragRef: SeriesBlockSeriesData$key;
};

export const SeriesBlockFromSeries: React.FC<FromSeriesProps> = (
    { fragRef, ...rest },
) => {
    const series = useFragment(seriesFragment, fragRef);
    return <SeriesBlock series={series} {...rest} />;
};

type Props = SharedFromSeriesProps & {
    series: SeriesBlockSeriesData$data;
};

const VIDEO_GRID_BREAKPOINT = 600;

const SeriesBlock: React.FC<Props> = ({ series, ...props }) => {
    const { t } = useTranslation();

    if (!isSynced(series)) {
        const { title } = props;
        return <SeriesBlockContainer title={title}>
            {t("series.not-ready.text")}
        </SeriesBlockContainer>;
    }

    return <ReadySeriesBlock series={series} {...props} />;
};

type ReadyProps = SharedFromSeriesProps & {
    series: SyncedOpencastEntity<SeriesBlockSeriesData$data>;
};

const ReadySeriesBlock: React.FC<ReadyProps> = ({
    basePath,
    title,
    series,
    activeEventId,
    order = "NEW_TO_OLD",
    showTitle = true,
    showMetadata,
}) => {
    const { t } = useTranslation();

    const finalTitle = title ?? (showTitle ? series.title : undefined);

    const events = series.events.filter(event =>
        !isPastLiveEvent(event.syncedData?.endTime ?? null, event.isLive));

    const sortedEvents = [...events];
    sortedEvents.sort(match(order, {
        "NEW_TO_OLD": () => compareNewToOld,
        "OLD_TO_NEW": () => compareOldToNew,
    }, unreachable));

    const eventsUI = events.length === 0
        ? t("series.no-events")
        : <VideoGrid>
            {sortedEvents.map(
                event => <GridTile
                    key={event.id}
                    active={event.id === activeEventId}
                    {...{ basePath, event }}
                />,
            )}
        </VideoGrid>;

    return <>
        {showMetadata && !showTitle && <Description text={series.syncedData.description} />}
        <SeriesBlockContainer title={finalTitle}>
            {showMetadata && showTitle && series.syncedData.description && <>
                <Description text={series.syncedData.description} css={{ fontSize: 14 }} />
                <hr css={{ margin: "20px 0" }} />
            </>}
            {eventsUI}
        </SeriesBlockContainer>
    </>;
};

type Event = SeriesBlockSeriesData$data["events"][0];

const compareNewToOld = compareByKey((event: Event): number => (
    new Date(event.created).getTime()
));
const compareOldToNew = swap(compareNewToOld);

type SeriesBlockContainerProps = {
    title?: string;
    children: ReactNode;
};

const SeriesBlockContainer: React.FC<SeriesBlockContainerProps> = ({ title, children }) => (
    <div css={{
        marginTop: 24,
        padding: 12,
        ...title && { paddingTop: 0 },
        backgroundColor: "var(--grey95)",
        borderRadius: 10,
    }}>
        {/* This is a way to make this fancy title. It's not perfect, but it works fine. */}
        {title && <div css={{ maxHeight: 50 }}>
            <h2 title={title} css={{
                backgroundColor: "var(--accent-color)",
                color: "var(--accent-color-bw-contrast)",
                padding: "4px 12px",
                borderRadius: 10,
                transform: "translateY(-50%)",
                fontSize: 19,
                margin: "0 8px",
                lineHeight: 1.3,
                ...ellipsisOverflowCss(3),
                display: "-webkit-inline-box",
            }}>{title}</h2>
        </div>}
        {children}
    </div>
);

const VideoGrid: React.FC<React.PropsWithChildren> = ({ children }) => (
    <div css={{
        display: "flex",
        flexWrap: "wrap",
        [`@media (max-width: ${VIDEO_GRID_BREAKPOINT}px)`]: {
            justifyContent: "center",
        },
    }}>
        {children}
    </div>
);

type GridTypeProps = {
    basePath: string;
    event: Event;
    active: boolean;
};

const GridTile: React.FC<GridTypeProps> = ({ event, basePath, active }) => {
    const TRANSITION_IN_DURATION = "0.15s";
    const TRANSITION_OUT_DURATION = "0.3s";
    const date = event.isLive ? event.syncedData?.startTime ?? event.created : event.created;

    const inner = <>
        <div css={{ borderRadius: 8, position: "relative" }}>
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
                    transition: `transform ${TRANSITION_OUT_DURATION}, `
                        + `opacity ${TRANSITION_OUT_DURATION}`,
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
                display: "flex",
                alignItems: "center",
                fontSize: "inherit",
                gap: 4,
                marginBottom: 4,
            }}>
                {active && <FiPlay css={{
                    flex: "0 0 auto",
                    strokeWidth: 3,
                    color: "var(--accent-color)",
                    animation: `${keyframes({
                        "0%": { opacity: 1 },
                        "50%": { opacity: 0.4 },
                        "100%": { opacity: 1 },
                    })} 2s infinite`,
                }}/>}
                <div css={{
                    fontSize: "inherit",
                    lineHeight: 1.3,
                    ...ellipsisOverflowCss(2),
                }}>{event.title}</div>
            </h3>
            <div css={{
                color: "var(--grey20)",
                fontSize: 14,
                display: "flex",
                flexWrap: "wrap",
                "& > span": {
                    display: "inline-block",
                    whiteSpace: "nowrap",
                },
            }}>
                {event.creators.length > 0 && <span css={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    "&:after": {
                        content: "'•'",
                        padding: "0 8px",
                    },
                    // TODO: maybe find something better than `join`
                }}>{event.creators.join(", ")}</span>}
                {/* `new Date` is well defined for our ISO Date strings */}
                <RelativeDate date={new Date(date)} isLive={event.isLive} />
            </div>
        </div>
    </>;

    const containerStyle = {
        position: "relative",
        display: "block",
        margin: "8px 6px 28px 6px",
        padding: 6,
        width: 16 * 15,
        borderRadius: 12,
        "& a": { color: "black", textDecoration: "none" },
        [`@media (max-width: ${VIDEO_GRID_BREAKPOINT}px)`]: {
            width: "100%",
            maxWidth: 360,
        },
        ...active && {
            backgroundColor: "var(--grey86)",
        },
        ...!active && {
            "& > div:first-child": {
                transition: `transform ${TRANSITION_OUT_DURATION}, `
                    + `box-shadow ${TRANSITION_OUT_DURATION}`,
            },
            "&:hover > div:first-child, &:focus-visible > div:first-child": {
                boxShadow: "0 6px 10px rgb(0 0 0 / 40%)",
                transform: "perspective(500px) rotateX(7deg) scale(1.05)",
                transitionDuration: TRANSITION_IN_DURATION,
                "& > div:nth-child(2) > div": {
                    opacity: 0.2,
                    transform: "rotate(30deg)",
                    transitionDuration: TRANSITION_IN_DURATION,
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
            to={`${basePath}/${keyOfId(event.id)}`}
            css={containerStyle}
        >{inner}</Link>;
};
