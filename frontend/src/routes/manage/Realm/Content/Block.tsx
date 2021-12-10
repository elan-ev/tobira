import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFragment, graphql } from "react-relay";

import type { BlockRealmData$key } from "../../../../query-types/BlockRealmData.graphql";
import { boxError } from "../../../../ui/error";
import { displayCommitError } from "../util";
import { Block } from "../../../../ui/Blocks";
import { EditButtons } from "./Edit";


type Props = {
    realm: BlockRealmData$key;
    index: number;
    onCommit?: () => void;
    onCompleted?: () => void;
    onError?: (error: Error, action: string, index: number) => void;
};

export const EditBlock: React.FC<Props> = ({
    realm: realmRef,
    index,
    onCommit,
    onCompleted,
    onError,
}) => {
    const { t } = useTranslation();

    const realm = useFragment(graphql`
        fragment BlockRealmData on Realm {
            ... BlocksRealmData
            ... EditButtonsRealmData
            blocks {
                ... BlocksBlockData
            }
        }
    `, realmRef);
    const block = realm.blocks[index];


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

            <Block {...{ block, realm }} />
        </div>
    </>;
};
