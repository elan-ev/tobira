import React from "react";
import { graphql, useFragment } from "react-relay/hooks";
import type {
    Blocks_blocks as QueryResult,
    Blocks_blocks$key,
} from "../query-types/Blocks_blocks.graphql";

import { match } from "../util";
import { unreachable } from "../util/err";
import { TextBlock } from "./blocks/Text";
import { SeriesBlock } from "./blocks/Series";


type Props = {
    realm: Blocks_blocks$key;
};
export type BlockData = QueryResult["blocks"][0];

export const Blocks: React.FC<Props> = ({ realm }) => {
    const { path, blocks } = useFragment(
        graphql`
            fragment Blocks_blocks on Realm {
                path
                blocks {
                    id
                    title
                    __typename
                    ... on TextBlock { content }
                    ... on SeriesBlock {
                        series {
                            title
                            events {
                                id
                                title
                                thumbnail
                                duration
                                created
                                tracks { resolution }
                            }
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
                title={block.title ?? undefined}
                content={unwrap(block, "content")}
            />,
            "SeriesBlock": () => <SeriesBlock
                key={block.id}
                title={block.title ?? undefined}
                realmPath={path}
                series={unwrap(block, "series")}
            />,
        }))
    }</>;
};

export const Title: React.FC<{ title?: string }> = ({ title }) => (
    title === undefined ? null : <h2>{title}</h2>
);

export const Block: React.FC = ({ children }) => (
    <div css={{
        margin: "30px 0",
        ":first-of-type": {
            marginTop: 0,
        },
    }}>{children}</div>
);

/** A helper function to getting block-type dependent fields as non-null values. */
function unwrap<K extends keyof BlockData>(block: BlockData, field: K): NonNullable<BlockData[K]> {
    /**
     * This is a function because for some reason, inlining this check below
     * confused the TS compiler. In that case it wouldn't understand that
     * `return v` in the end is actually a non-null value.
     */
    function isNotNullish<T>(value: T): value is NonNullable<T> {
        return value !== undefined && value !== null;
    }

    const v = block[field];
    if (!isNotNullish(v)) {
        return unreachable(`field '${field}' of block is null, but that should `
            + `never happen for the type '${block.__typename}'`);
    }

    return v;
}
