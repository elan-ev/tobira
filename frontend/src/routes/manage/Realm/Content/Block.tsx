import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFragment, graphql } from "react-relay";

import type { BlockRealmData$key } from "../../../../query-types/BlockRealmData.graphql";
import { match } from "../../../../util";
import { boxError } from "../../../../ui/error";
import { displayCommitError } from "../util";
import { TextBlockByQuery } from "../../../../ui/blocks/Text";
import { SeriesBlockFromBlock } from "../../../../ui/blocks/Series";
import { EditButtons } from "./Edit";


type Props = {
    realm: BlockRealmData$key;
    index: number;
    onCommit?: () => void;
    onCompleted?: () => void;
    onError?: (error: Error, action: string, index: number) => void;
};

export const Block: React.FC<Props> = ({
    realm: realmRef,
    index,
    onCommit,
    onCompleted,
    onError,
}) => {
    const { t } = useTranslation();

    const realm = useFragment(graphql`
        fragment BlockRealmData on Realm {
            path
            ... EditButtonsRealmData
            blocks {
                id
                title
                __typename
                ... on SeriesBlock { ... SeriesBlockData }
                ... on TextBlock { ... TextBlockData }
            }
        }
    `, realmRef);
    const { path, blocks } = realm;
    const block = blocks[index];


    const [error, setError] = useState<JSX.Element | null>(null);

    const onBlockCommit = () => {
        setError(null);
        onCommit?.();
    };

    const onBlockCompleted = () => {
        setError(null);
        onCompleted?.();
    };

    const onBlockError = (error: Error, action: string) => {
        setError(displayCommitError(error, t(action)));
        onError?.(error, action, index);
    };


    return <>
        {boxError(error)}

        <div css={{
            alignSelf: "stretch",
            border: "1px solid var(--grey80)",
            borderRadius: 4,
            padding: 8,
            overflow: "hidden",
        }}>
            <EditButtons
                {...{ realm, index }}
                onCompleted={onBlockCompleted}
                onCommit={onBlockCommit}
                onError={onBlockError}
            />

            {match(block.__typename, {
                "TextBlock": () => <TextBlockByQuery
                    title={block.title ?? undefined}
                    fragRef={block}
                />,
                "SeriesBlock": () => <SeriesBlockFromBlock
                    title={block.title ?? undefined}
                    realmPath={path}
                    fragRef={block}
                />,
            })}
        </div>
    </>;
};
