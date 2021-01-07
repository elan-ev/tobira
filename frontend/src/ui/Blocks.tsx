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
            "VideoList": () => <VideoListBlock title={block.title} />,
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

const VideoListBlock: React.FC<{ title: string | null }> = ({ title }) => (
    <Block>
        <Title title={title} />
        <i>not yet implemented ☹️</i>
    </Block>
);

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
