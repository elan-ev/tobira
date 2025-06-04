import React, { useRef } from "react";
import { useTranslation, Trans } from "react-i18next";
import { useFragment, graphql, useMutation } from "react-relay";
import { LuTrash } from "react-icons/lu";
import { WithTooltip } from "@opencast/appkit";

import type { RemoveButtonData$key } from "./__generated__/RemoveButtonData.graphql";
import type { RemoveButtonMutation } from "./__generated__/RemoveButtonMutation.graphql";
import {
    ConfirmationModal, ConfirmationModalHandle, Modal, ModalHandle,
} from "../../../../../ui/Modal";
import { displayCommitError } from "../../util";
import { Button } from "../util";
import { currentRef } from "../../../../../util";
import { COLORS } from "../../../../../color";


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
                    displayCommitError(error, t("manage.block.removing-failed")),
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
                    color: COLORS.danger0,
                    "&&:hover, &&:focus": {
                        backgroundColor: COLORS.danger0,
                        color: COLORS.danger0BwInverted,
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
                <LuTrash />
            </Button>
        </WithTooltip>
        <Modal ref={cannotDeleteModalRef} title={t("manage.realm.content.cannot-remove-block")}>
            {t("manage.realm.content.cannot-remove-name-source-block")}
        </Modal>
        <ConfirmationModal
            title={t("manage.realm.content.confirm-removal")}
            buttonContent={t("manage.realm.content.remove")}
            onSubmit={remove}
            ref={modalRef}
        >
            <p>
                <Trans i18nKey="general.action.cannot-be-undone" />
            </p>
        </ConfirmationModal>
    </>;
};
