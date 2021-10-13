import React from "react";

import { keyOfId } from "../../util";
import { Block, Title } from ".";
import { Link } from "../../router";
import { useTranslation } from "react-i18next";
import { graphql, useFragment } from "react-relay";
import { FiFilm, FiPlay, FiVolume2 } from "react-icons/fi";

import { SeriesBlockData$key } from "../../query-types/SeriesBlockData.graphql";
import {
    SeriesBlockSeriesData,
    SeriesBlockSeriesData$key,
} from "../../query-types/SeriesBlockSeriesData.graphql";
import { keyframes } from "@emotion/react";


type SharedProps = {
    title?: string;
    realmPath: string;
    activeEventId?: string;
};

const blockFragment = graphql`
    fragment SeriesBlockData on SeriesBlock {
        series { ...SeriesBlockSeriesData }
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
    const { series } = useFragment(blockFragment, fragRef);
    return <SeriesBlockFromSeries fragRef={series} {...rest} />;
};

type FromSeriesProps = SharedProps & {
    fragRef: SeriesBlockSeriesData$key;
};

export const SeriesBlockFromSeries: React.FC<FromSeriesProps> = ({ fragRef, ...rest }) => {
    const series = useFragment(seriesFragment, fragRef);
    return <SeriesBlock {...{ series, ...rest }} />;
};

type Props = SharedProps & {
    series: NonNullable<SeriesBlockSeriesData>;
};

const VIDEO_GRID_BREAKPOINT = 600;

export const SeriesBlock: React.FC<Props> = ({ title, series, realmPath, activeEventId }) => (
    <Block>
        <Title title={title ?? series.title} />
        <div css={{
            display: "flex",
            flexWrap: "wrap",
            marginTop: 8,
            padding: 12,
            backgroundColor: "var(--grey97)",
            borderRadius: 4,
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
    </Block>
);

type GridTypeProps = {
    realmPath: string;
    event: NonNullable<SeriesBlockSeriesData>["events"][0];
    active: boolean;
};

const GridTile: React.FC<GridTypeProps> = ({ event, realmPath, active }) => {
    const [THUMB_WIDTH, THUMB_HEIGHT] = [16, 9].map(x => x * 15);

    const sharedThumbnailStyle = {
        width: "100%",
        height: "auto",
        borderRadius: 4,
        // TODO: Not supported by Safari 14.1. Maybe used padding trick instead!
        aspectRatio: "16 / 9",
    };
    let thumbnail;
    if (event.thumbnail != null) {
        // We have a proper thumbnail.
        thumbnail = <img
            src={event.thumbnail}
            width={THUMB_WIDTH}
            height={THUMB_HEIGHT}
            css={{
                display: "block",
                ...sharedThumbnailStyle,
            }}
        />;
    } else {
        // We have no thumbnail. If the resolution is `null` as well, we are
        // dealing with an audio-only event and show an appropriate icon.
        // Otherwise we use a generic icon.
        const icon = event.tracks.every(t => t.resolution == null) ? <FiVolume2 /> : <FiFilm />;

        thumbnail = (
            <div css={{
                display: "flex",
                backgroundColor: "var(--grey92)",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 40,
                ...sharedThumbnailStyle,
            }}>{icon}</div>
        );
    }



    const inner = <>
        <div css={{
            position: "relative",
            boxShadow: "0 0 4px var(--grey92)",
            transition: "0.2s box-shadow",
        }}>
            {thumbnail}
            {active && <ActiveIndicator />}
            {event.duration != null && (
                <div css={{
                    position: "absolute",
                    right: 6,
                    bottom: 6,
                    backgroundColor: "hsla(0, 0%, 0%, 0.75)",
                    border: "1px solid black",
                    borderRadius: 4,
                    padding: "0 4px",
                    color: "white",
                    fontSize: 14,
                }}>
                    {formatLength(event.duration)}
                </div>
            )}
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
                <CreationDate date={new Date(event.created)} />
            </div>
        </div>
    </>;

    const containerStyle = {
        display: "block",
        margin: 8,
        marginBottom: 32,
        width: THUMB_WIDTH,
        borderRadius: 4,
        "& a": { color: "black", textDecoration: "none" },
        [`@media (max-width: ${VIDEO_GRID_BREAKPOINT}px)`]: {
            width: "100%",
            maxWidth: 360,
        },
        ...!active && {
            "&:hover > div:first-child": {
                boxShadow: "0 0 10px var(--grey80)",
            },
            "&:focus-visible": {
                outline: "none",
                boxShadow: "0 0 0 2px var(--accent-color)",
            },
        },
    };

    return active
        ? <div css={{ ...containerStyle, display: "inline-block" }}>{inner}</div>
        : <Link
            to={`${realmPath}${realmPath.endsWith("/") ? "" : "/"}v/${keyOfId(event.id)}`}
            css={containerStyle}
        >{inner}</Link>;
};

const formatLength = (totalMs: number) => {
    const totalSeconds = Math.round(totalMs / 1000);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / (60 * 60));

    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

    if (hours > 0) {
        return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    } else {
        return `${minutes}:${pad(seconds)}`;
    }
};

type CreationDateProps = {
    date: Date;
};

const CreationDate: React.FC<CreationDateProps> = ({ date }) => {
    const { i18n } = useTranslation();
    const secsAgo = Math.floor((Date.now() - date.getTime()) / 1000);

    const prettyDate = (() => {
        const intl = new Intl.RelativeTimeFormat(i18n.language);
        if (secsAgo <= 55) {
            return intl.format(-secsAgo, "second");
        } else if (secsAgo <= 55 * 60) {
            return intl.format(-Math.round(secsAgo / 60), "minute");
        } else if (secsAgo <= 23 * 60 * 60) {
            return intl.format(-Math.round(secsAgo / 60 / 60), "hour");
        } else if (secsAgo <= 6 * 24 * 60 * 60) {
            return intl.format(-Math.round(secsAgo / 24 / 60 / 60), "day");
        } else if (secsAgo <= 3.5 * 7 * 24 * 60 * 60) {
            return intl.format(-Math.round(secsAgo / 7 / 24 / 60 / 60), "week");
        } else if (secsAgo <= 11 * 30.5 * 24 * 60 * 60) {
            return intl.format(-Math.round(secsAgo / 30.5 / 24 / 60 / 60), "month");
        } else {
            return intl.format(-Math.round(secsAgo / 365.25 / 24 / 60 / 60), "year");
        }
    })();

    const preciseDate = date.toLocaleString(i18n.language);

    return <span title={preciseDate}>{prettyDate}</span>;
};

const ActiveIndicator = () => {
    const animation = keyframes({
        "0%": { color: "black" },
        "50%": { color: "var(--accent-color-darker)" },
        "100%": { color: "black" },
    });

    return (
        <div css={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(255, 255, 255, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 64,
            "& > svg": {
                animation: `${animation} 3s infinite`,
            },
        }}>
            <FiPlay />
        </div>
    );
};
