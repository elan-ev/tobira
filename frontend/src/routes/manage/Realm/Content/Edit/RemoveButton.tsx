import React, { useRef } from "react";
import { useTranslation, Trans } from "react-i18next";
import { useFragment, graphql, useMutation } from "react-relay";
import { FiTrash } from "react-icons/fi";

import type { RemoveButtonData$key } from "../../../../../query-types/RemoveButtonData.graphql";
import type { RemoveButtonMutation } from "../../../../../query-types/RemoveButtonMutation.graphql";
import { ConfirmationModal, ConfirmationModalHandle } from "../../../../../ui/Modal";
import { displayCommitError } from "../../util";
import { Button } from "../util";


type Props = {
    block: RemoveButtonData$key;
    onConfirm?: () => void;
};

export const RemoveButton: React.FC<Props> = ({ block: blockRef, onConfirm }) => {
    const { t } = useTranslation();


    const block = useFragment(graphql`
        fragment RemoveButtonData on Block {
            id
        }
    `, blockRef);


    const [commit] = useMutation<RemoveButtonMutation>(graphql`
        mutation RemoveButtonMutation($id: ID!) {
            removeBlock(id: $id) {
                id @deleteRecord
                realm {
                    ... ContentManageRealmData
                }
            }
        }
    `);

    const remove = () => {
        commit({
            variables: block,
            onCompleted: () => {
                modalRef.current?.done();
            },
            onError: error => {
                modalRef.current?.reportError(
                    displayCommitError(error, t("manage.realm.content.removing-failed")),
                );
            },
        });
    };


    const modalRef = useRef<ConfirmationModalHandle>(null);

    return <>
        <Button
            title={t("manage.realm.content.remove")}
            css={{
                color: "var(--danger-color)",
                "&&:hover": {
                    backgroundColor: "var(--danger-color)",
                    color: "white",
                },
            }}
            onClick={() => {
                modalRef.current?.open();
                onConfirm?.();
            }}
        >
            <FiTrash />
        </Button>
        <ConfirmationModal
            buttonContent={t("manage.realm.content.remove")}
            onSubmit={remove}
            ref={modalRef}
        >
            <p>
                <Trans i18nKey="manage.realm.danger-zone.delete.cannot-be-undone">
                    action <strong>cannot</strong> be undone
                </Trans>
            </p>
        </ConfirmationModal>
    </>;
};
