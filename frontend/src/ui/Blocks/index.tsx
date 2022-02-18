import React from "react";
import { graphql, useFragment } from "react-relay/hooks";

import { BlocksData$key } from "./__generated__/BlocksData.graphql";
import { BlocksRealmData$key } from "./__generated__/BlocksRealmData.graphql";
import { BlocksBlockData$key } from "./__generated__/BlocksBlockData.graphql";
import { match } from "../../util";
import { TextBlockByQuery } from "./Text";
import { SeriesBlockFromBlock } from "./Series";
import { VideoBlock } from "./Video";


type BlocksProps = {
    realm: BlocksData$key;
};

export const Blocks: React.FC<BlocksProps> = ({ realm: realmRef }) => {
    const realm = useFragment(graphql`
        fragment BlocksData on Realm {
            ... BlocksRealmData
            blocks {
                id
                ... BlocksBlockData
            }
        }
    `, realmRef);
    const { blocks } = realm;

    return (
        <div css={{
            display: "flex",
            flexDirection: "column",
            rowGap: 32,
        }}>
            {blocks.map(
                block => <Block key={block.id} realm={realm} block={block} />,
            )}
        </div>
    );
};

type BlockProps = {
    realm: BlocksRealmData$key;
    block: BlocksBlockData$key;
};

export const Block: React.FC<BlockProps> = ({ block: blockRef, realm }) => {
    const { path } = useFragment(graphql`
        fragment BlocksRealmData on Realm {
            path
        }
    `, realm);

    const block = useFragment(graphql`
        fragment BlocksBlockData on Block {
            id # TODO just querying for the type and fragments bugs out Relay's type generation
            __typename
            ... on TextBlock { ... TextBlockData }
            ... on SeriesBlock { ... SeriesBlockData }
            ... on VideoBlock { ... VideoBlockData }
        }
    `, blockRef);
    const { __typename } = block;

    return <div>
        {match(__typename, {
            "TextBlock": () => <TextBlockByQuery
                fragRef={block}
            />,
            "SeriesBlock": () => <SeriesBlockFromBlock
                realmPath={path}
                fragRef={block}
            />,
            "VideoBlock": () => <VideoBlock
                fragRef={block}
            />,
        })}
    </div>;
};

export const Title: React.FC<{ title?: string }> = ({ title }) => (
    title === undefined ? null : <h2 css={{ margin: "16px 0" }}>{title}</h2>
);
