import React from "react";
import ReactMarkdown, { TransformOptions } from "react-markdown";
import { Link } from "react-router-dom";
import { graphql, useFragment } from "react-relay/hooks";
import {
    Blocks_blocks as QueryResult,
    Blocks_blocks$key,
} from "../query-types/Blocks_blocks.graphql";

import { match, keyOfId } from "../util";
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
                    ... on TextBlock { content }
                    ... on SeriesBlock {
                        series {
                            title
                            events { id title thumbnail duration }
                        }
                    }
                }
            }
        `,
        realm,
    );

    return <>{
        blocks.map(block => match(block.__typename, {
            "TextBlock": () => <TextBlock
                key={block.id}
                title={block.title}
                content={unwrap(block, "content")}
            />,
            "SeriesBlock": () => <SeriesBlock
                key={block.id}
                title={block.title}
                series={unwrap(block, "series")}
            />,
        }))
    }</>;
};

type TextProps = {
    title: string | null;
    content: string;
};

// We don't just want to allow everything, so here we explicitly list what we
// support. Notably missing:
//
// - img (we might want to allow them but need to figure out storage first)
// - headings (if we allow them, we need to map `#` to h2 or h3 so that they
//   don't interfere with other headings on the page.)
const ALLOWED_MARKDOWN_TAGS = [
    "p", "blockquote", "pre", "ul", "ol", "li", "a", "em", "strong", "code", "hr",
];

const CODE_BACKGROUND_COLOR = "#f9f9f6";

// We override some components emitted by the Markdown parser to add CSS.
const MARKDOWN_COMPONENTS: TransformOptions["components"] = {
    p: ({ node, ...props }) => <p css={{ margin: "16px 0" }} {...props} />,
    blockquote: ({ node, ...props }) => <blockquote
        css={{
            borderLeft: "4px solid #e5e5e5",
            padding: "2px 8px",
            "& > *:first-child": { marginTop: 0 },
            "& > *:last-child": { marginBottom: 0 },
        }}
        {...props}
    />,
    code: ({ node, className, inline, ...props }) => <code
        css={inline === true && {
            backgroundColor: CODE_BACKGROUND_COLOR,
            padding: "1px 3px",
            borderRadius: "4px",
        }}
        {...props}
    />,
    pre: ({ node, ...props }) => <pre
        css={{
            backgroundColor: CODE_BACKGROUND_COLOR,
            padding: "8px",
        }}
        {...props}
    />,
};

const TextBlock: React.FC<TextProps> = ({ title, content }) => (
    <Block>
        <Title title={title} />
        <div css={{
            maxWidth: 800,
            padding: "6px 10px",
            "& > *:first-child": { marginTop: 0 },
            "& > *:last-child": { marginBottom: 0 },
        }}>
            <ReactMarkdown allowedElements={ALLOWED_MARKDOWN_TAGS} components={MARKDOWN_COMPONENTS}>
                {content}
            </ReactMarkdown>
        </div>
    </Block>
);

type SeriesProps = {
    title: string | null;
    series: NonNullable<BlockData["series"]>;
};

const SeriesBlock: React.FC<SeriesProps> = ({ title, series }) => {
    const [THUMB_WIDTH, THUMB_HEIGHT] = [16, 9].map(x => x * 13);

    return (
        <Block>
            <Title title={title} />
            <div css={{
                display: "flex",
                flexWrap: "wrap",
            }}>
                {series.events.map(event => {
                    const url = `/v/${keyOfId(event.id)}`;

                    return (
                        <div
                            key={event.id}
                            css={{
                                margin: "12px 8px",
                                width: THUMB_WIDTH,
                                "& a": { color: "black", textDecoration: "none" },
                            }}
                        >
                            <Link to={url} css={{ position: "relative", display: "block" }}>
                                <img
                                    src={event.thumbnail}
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
                                    {formatLength(event.duration)}
                                </div>
                            </Link>

                            <h3 css={{
                                fontSize: 16,
                            }}>
                                <Link to={url}>{event.title}</Link>
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
    } else {
        return `${minutes}:${pad(seconds)}`;
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
