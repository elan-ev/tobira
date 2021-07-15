import React from "react";

import { keyOfId } from "../../util";
import { Block, Title } from "../Blocks";
import type { BlockData } from "../Blocks";
import { Link } from "../../router";


type Props = {
    title?: string;
    series: NonNullable<BlockData["series"]>;
    realmPath: string;
};

export const SeriesBlock: React.FC<Props> = ({ title, series, realmPath }) => (
    <Block>
        <Title title={title} />
        <div css={{
            display: "flex",
            flexWrap: "wrap",
        }}>
            {series.events.map(event => <GridTile key={event.id} {...{ realmPath, event }} />)}
        </div>
    </Block>
);

type GridTypeProps = {
    realmPath: string;
    event: NonNullable<BlockData["series"]>["events"][0];
};

const GridTile: React.FC<GridTypeProps> = ({ event, realmPath }) => {
    const [THUMB_WIDTH, THUMB_HEIGHT] = [16, 9].map(x => x * 15);

    return (
        <Link
            to={`${realmPath}/v/${keyOfId(event.id)}`}
            css={{
                display: "block",
                margin: "12px 8px",
                marginBottom: 32,
                width: THUMB_WIDTH,
                "& a": { color: "black", textDecoration: "none" },
            }}
        >
            <div css={{ position: "relative" }}>
                <img
                    src={event.thumbnail}
                    width={THUMB_WIDTH}
                    height={THUMB_HEIGHT}
                    css={{ display: "block", borderRadius: 4 }}
                />
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
                }}>{
                    // `new Date` with a string is discouraged but it's well
                    // defined for our ISO Date strings
                    formatDate(new Date(event.created))
                }</div>
            </div>
        </Link>
    );
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

// TODO: this needs to be improved to (a) use the app language and (b) to
// probably show fancy stuff like "a week ago" or so.
const formatDate = (date: Date): string => date.toLocaleString();
