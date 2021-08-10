import React from "react";
import { graphql, useFragment } from "react-relay/hooks";
import type {
    Blocks_blocks as QueryResult,
    Blocks_blocks$key,
} from "../query-types/Blocks_blocks.graphql";

import { match } from "../util";
import { TextBlockByQuery } from "./blocks/Text";
import { SeriesBlockByQuery } from "./blocks/Series";


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
                    ... on SeriesBlock { ... SeriesBlockData }
                    ... on TextBlock { ... TextBlockData }
                }
            }
        `,
        realm,
    );

    return <>{
        blocks.map(block => match(block.__typename, {
            "TextBlock": () => <TextBlockByQuery
                key={block.id}
                title={block.title ?? undefined}
                fragRef={block}
            />,
            "SeriesBlock": () => <SeriesBlockByQuery
                key={block.id}
                title={block.title ?? undefined}
                realmPath={path}
                fragRef={block}
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
