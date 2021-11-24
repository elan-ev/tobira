import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFragment, graphql, useRelayEnvironment, commitLocalUpdate } from "react-relay";

import type { BlockRealmData$key } from "../../../../query-types/BlockRealmData.graphql";
import { bug } from "../../../../util/err";
import { boxError } from "../../../../ui/error";
import { displayCommitError } from "../util";
import { Block } from "../../../../ui/Blocks";
import { EditButtons } from "./Edit";
import { EditMode } from "./Edit/EditMode";


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
            id
            ... BlocksRealmData
            ... EditButtonsRealmData
            ... EditModeRealmData
            blocks {
                id
                editMode
                ... BlocksBlockData
            }
        }
    `, realmRef);
    const { id: realmId, blocks } = realm;
    const block = blocks[index];
    const { id, editMode } = block;


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


    const relayEnv = useRelayEnvironment();
    const setEditMode = (editMode: boolean) => {
        commitLocalUpdate(relayEnv, store => {
            const block = store.get(id) || bug("could not find block");
            block.setValue(editMode, "editMode");
        });
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
            {editMode
                ? <EditMode
                    {...{ realm, index }}
                    onCancel={() => {
                        if (id.startsWith("cl")) {
                            commitLocalUpdate(relayEnv, store => {
                                const realm = store.get(realmId) ?? bug("could not find realm");

                                const blocks = [
                                    ...realm.getLinkedRecords("blocks")
                                        ?? bug("realm does not have any blocks"),
                                ];

                                blocks.splice(index, 1);

                                realm.setLinkedRecords(blocks, "blocks");

                                store.delete("clNEWBLOCK");
                            });
                        } else {
                            setEditMode(false);
                            setError(null);
                        }
                    }}
                    onSave={onBlockCommit}
                    onError={error => onBlockError(error, "manage.realm.content.saving-failed")}
                    onCompleted={() => {
                        onBlockCompleted();
                        setEditMode(false);
                        commitLocalUpdate(relayEnv, store => {
                            store.delete("clNEWBLOCK");
                        });
                    }}
                />
                : <>
                    <EditButtons
                        {...{ realm, index }}
                        onCompleted={onBlockCompleted}
                        onCommit={onBlockCommit}
                        onError={onBlockError}
                        onEdit={() => setEditMode(true)}
                    />

                    <Block {...{ block, realm }} />
                </>}
        </div>
    </>;
};
