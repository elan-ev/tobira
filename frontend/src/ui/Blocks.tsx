import React from "react";
import { graphql, useFragment } from "react-relay/hooks";
import {
    Blocks_blocks as QueryResult,
    Blocks_blocks$key,
} from "../query-types/Blocks_blocks.graphql";

import { match } from "../util";
import { unreachable } from "../util/err";


type Props = {
    realm: Blocks_blocks$key;
};
type BlockData = QueryResult["blocks"][0];

export const Blocks: React.FC<Props> = ({ realm }) => {
    const { blocks } = useFragment(
        graphql`
            fragment Blocks_blocks on Realm {
                blocks {
                    id
                    title
                    __typename
                    ... on Text { content }
                }
            }
        `,
        realm,
    );

    return <>{
        blocks.map(block => match(block.__typename, {
            "Text": () => <TextBlock
                key={block.id}
                title={block.title}
                content={unwrap(block, "content")}
            />,
            "VideoList": () => <VideoListBlock key={block.id} title={block.title} />,
        }))
    }</>;
};

type TextProps = {
    title: string | null;
    content: string;
};

const TextBlock: React.FC<TextProps> = ({ title, content }) => (
    <Block>
        <Title title={title} />
        <div css={{
            maxWidth: 800,
            borderLeft: "4px solid #e5e5e5",
            padding: "6px 10px",
        }}>{content}</div>
    </Block>
);

const VideoListBlock: React.FC<{ title: string | null }> = ({ title }) => {
    const [THUMB_WIDTH, THUMB_HEIGHT] = [16, 9].map(x => x * 13);

    return (
        <Block>
            <Title title={title} />
            <div css={{
                display: "flex",
                flexWrap: "wrap",
            }}>
                {DUMMY_VIDEOS.map(v => {
                    const url = `/v/${v.id}`;

                    return (
                        <div
                            key={v.id}
                            css={{
                                margin: "12px 8px",
                                width: THUMB_WIDTH,
                                "& a": { color: "black", textDecoration: "none" },
                            }}
                        >
                            <a href={url} css={{ position: "relative", display: "block" }}>
                                <img
                                    src={v.thumbnail}
                                    width={THUMB_WIDTH}
                                    height={THUMB_HEIGHT}
                                    css={{ display: "block" }}
                                />
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
                                    {formatLength(v.length)}
                                </div>
                            </a>

                            <h3 css={{
                                fontSize: 16,
                            }}>
                                <a href={url}>{v.title}</a>
                            </h3>
                        </div>
                    );
                })}
            </div>
        </Block>
    );
};

const formatLength = (totalSeconds: number) => {
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / (60 * 60));

    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

    if (hours > 0) {
        return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    } else if (minutes > 0) {
        return `${minutes}:${pad(seconds)}`;
    } else {
        return `0:${pad(seconds)}`;
    }
};

const Title: React.FC<{ title: string | null }> = ({ title }) => (
    title === null ? null : <h2>{title}</h2>
);


const Block: React.FC = ({ children }) => (
    <div css={{ margin: "30px 0" }}>{children}</div>
);

// A helper function to getting block-type dependent fields as non-null values.
function unwrap<K extends keyof BlockData>(block: BlockData, field: K): NonNullable<BlockData[K]> {
    // This is a function because for some reason, inlining this check below
    // confused the TS compiler. In that case it wouldn't understand that
    // `return v` in the end is actually a non-null value.
    function isNotNullish<T>(value: T): value is NonNullable<T> {
        return value !== undefined && value !== null;
    }

    const v = block[field];
    if (!isNotNullish(v)) {
        return unreachable(`field '${field}' of block is null, but that should ` +
            `never happen for the type '${block.__typename}'`);
    }

    return v;
}

const DUMMY_VIDEOS = [
    {
        id: 0,
        title: "Programmieren in Rust: Einführung",
        length: 5123,
        thumbnail: "https://i.imgur.com/QtsTbCi.jpg",
    },
    {
        id: 1,
        title: "Programmieren in Rust: Module",
        length: 5018,
        thumbnail: "https://i.imgur.com/aoRSWgJ.jpg",
    },
    {
        id: 2,
        title: "The Physics behind a flying Bumblebee",
        length: 47,
        thumbnail: "https://i.imgur.com/TuS6Qxg.jpg",
    },
    {
        id: 3,
        title: "Programmieren in Rust: Performance & Effizienz",
        length: 5329,
        thumbnail: "https://i.imgur.com/4y40tkN.jpg",
    },
    {
        id: 4,
        title: "Spring (Open Blender Movie)",
        length: 464,
        thumbnail: "https://i.imgur.com/JhUYB7C.jpg",
    },
    {
        id: 5,
        title: "Cosmos Laundromat (Open Blender Movie)",
        length: 730,
        thumbnail: "https://i.imgur.com/qGOL4Jy.jpg",
    },
    {
        id: 6,
        title: "Programmieren in Rust: Stack & Heap",
        length: 5399,
        thumbnail: "https://i.imgur.com/XBDOO2R.jpg",
    },
];
