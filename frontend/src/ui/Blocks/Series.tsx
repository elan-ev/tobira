import React from "react";
import { graphql, useFragment } from "react-relay";

import { keyOfId } from "../../util";
import { BlockContainer, Title } from ".";
import { Link } from "../../router";
import { SeriesBlockData$key } from "./__generated__/SeriesBlockData.graphql";
import {
    SeriesBlockSeriesData,
    SeriesBlockSeriesData$key,
} from "./__generated__/SeriesBlockSeriesData.graphql";
import { Thumbnail } from "../Video";
import { RelativeDate } from "../time";


type SharedProps = {
    title?: string;
    realmPath: string;
    activeEventId?: string;
};

const blockFragment = graphql`
    fragment SeriesBlockData on SeriesBlock {
        series { ...SeriesBlockSeriesData }
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
    <BlockContainer>
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
    </BlockContainer>
);

type GridTypeProps = {
    realmPath: string;
    event: NonNullable<SeriesBlockSeriesData>["events"][0];
    active: boolean;
};

const GridTile: React.FC<GridTypeProps> = ({ event, realmPath, active }) => {
    const inner = <>
        <Thumbnail event={event} active={active} />
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
        display: "block",
        margin: 8,
        marginBottom: 32,
        width: 16 * 15,
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

