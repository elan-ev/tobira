import React, { useRef } from "react";
import { useTranslation, Trans } from "react-i18next";
import { useFragment, graphql, useMutation } from "react-relay";
import { FiTrash } from "react-icons/fi";

import type { RemoveButtonData$key } from "./__generated__/RemoveButtonData.graphql";
import type { RemoveButtonMutation } from "./__generated__/RemoveButtonMutation.graphql";
import {
    ConfirmationModal, ConfirmationModalHandle, Modal, ModalHandle,
} from "../../../../../ui/Modal";
import { displayCommitError } from "../../util";
import { Button } from "../util";
import { currentRef } from "../../../../../util";
import { WithTooltip } from "../../../../../ui/Floating";


type Props = {
    block: RemoveButtonData$key;
    onConfirm?: () => void;
    nameSourceBlock?: string;
};

export const RemoveButton: React.FC<Props> = ({ block: blockRef, onConfirm, nameSourceBlock }) => {
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
                currentRef(modalRef).done();
            },
            onError: error => {
                currentRef(modalRef).reportError(
                    displayCommitError(error, t("manage.realm.content.removing-failed")),
                );
            },
        });
    };


    const modalRef = useRef<ConfirmationModalHandle>(null);
    const cannotDeleteModalRef = useRef<ModalHandle>(null);

    return <>
        <WithTooltip tooltip={t("manage.realm.content.remove")}>
            <Button
                aria-label={t("manage.realm.content.remove")}
                css={{
                    color: "var(--danger-color)",
                    "&&:hover, &&:focus": {
                        backgroundColor: "var(--danger-color)",
                        color: "var(--danger-color-bw-contrast)",
                    },
                }}
                onClick={() => {
                    if (nameSourceBlock === block.id) {
                        currentRef(cannotDeleteModalRef).open();
                    } else {
                        currentRef(modalRef).open();
                        onConfirm?.();
                    }
                }}
            >
                <FiTrash />
            </Button>
        </WithTooltip>
        <Modal ref={cannotDeleteModalRef} title={t("manage.realm.content.cannot-remove-block")}>
            {t("manage.realm.content.cannot-remove-name-source-block")}
        </Modal>
        <ConfirmationModal
            title={t("manage.realm.content.confirm")}
            buttonContent={t("manage.realm.content.remove")}
            onSubmit={remove}
            ref={modalRef}
        >
            <p>
                <Trans i18nKey="manage.realm.danger-zone.delete.cannot-be-undone" />
            </p>
        </ConfirmationModal>
    </>;
};
