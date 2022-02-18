import React, { useRef } from "react";
import { useTranslation } from "react-i18next";
import { graphql, useFragment } from "react-relay";
import { FiX, FiCheck } from "react-icons/fi";
import { useForm, useFormContext, FormProvider } from "react-hook-form";

import type {
    EditModeRealmData$key,
} from "./__generated__/EditModeRealmData.graphql";
import { currentRef, match } from "../../../../../../util";
import { Button } from "../../util";
import { ButtonGroup } from "..";
import { ConfirmationModal, ConfirmationModalHandle } from "../../../../../../ui/Modal";
import { EditTextBlock, TextFormData } from "./Text";
import { EditSeriesBlock, SeriesFormData } from "./Series";
import { EditVideoBlock, VideoFormData } from "./Video";


type EditModeProps = {
    realm: EditModeRealmData$key;
    index: number;
    onCancel?: () => void;
    onSave?: () => void;
    onCompleted?: () => void;
    onError?: (error: Error) => void;
};

export type FormData = (
    { type: "TextBlock" } & TextFormData
) | (
    { type: "SeriesBlock" } & SeriesFormData
) | (
    { type: "VideoBlock" } & VideoFormData
);

export type EditModeRef = {
    save: (
        id: string,
        data: FormData,
        onCompleted?: () => void,
        onError?: (error: Error) => void,
    ) => void;
    create: (
        realm: string,
        index: number,
        data: FormData,
        onCompleted?: () => void,
        onError?: (error: Error) => void,
    ) => void;
};

export const EditMode: React.FC<EditModeProps> = ({
    realm: realmRef,
    index,
    onSave,
    onCancel,
    onCompleted,
    onError,
}) => {
    const { id: realmId, blocks } = useFragment(graphql`
        fragment EditModeRealmData on Realm {
            id
            blocks {
                id
                __typename
                ... on TextBlock { ... TextEditModeBlockData }
                ... on SeriesBlock { ... SeriesEditModeBlockData }
                ... on VideoBlock { ... VideoEditModeBlockData }
            }
        }
    `, realmRef);
    const block = blocks[index];
    const { id, __typename: type } = block;


    const form = useForm<FormData>({
        defaultValues: {
            type: type as "TextBlock" | "SeriesBlock" | "VideoBlock",
        },
    });
    const editModeRef = useRef<EditModeRef>(null);

    const onSubmit = form.handleSubmit(data => {
        onSave?.();

        if (id.startsWith("cl")) {
            currentRef(editModeRef).create(
                realmId,
                index,
                data,
                onCompleted,
                onError,
            );
        } else {
            currentRef(editModeRef).save(
                id,
                data,
                onCompleted,
                onError,
            );
        }
    });


    return <FormProvider<FormData> {...form}>
        <form onSubmit={onSubmit}>
            <EditModeButtons onCancel={onCancel} />
            {match(block.__typename, {
                "TextBlock": () => <EditTextBlock ref={editModeRef} block={block} />,
                "SeriesBlock": () => <EditSeriesBlock ref={editModeRef} block={block} />,
                "VideoBlock": () => <EditVideoBlock ref={editModeRef} block={block} />,
            })}
        </form>
    </FormProvider>;
};


type EditModeButtonsProps = {
    onCancel?: () => void;
};

const EditModeButtons: React.FC<EditModeButtonsProps> = ({ onCancel }) => {
    const { t } = useTranslation();

    const modalRef = useRef<ConfirmationModalHandle>(null);

    const { formState: { isDirty } } = useFormContext();

    return <ButtonGroup css={{ marginTop: -24 }}>
        <Button
            title={t("manage.realm.content.cancel")}
            onClick={() => {
                if (isDirty) {
                    currentRef(modalRef).open();
                } else {
                    onCancel?.();
                }
            }}
        >
            <FiX />
        </Button>
        <Button
            type="submit"
            title={t("manage.realm.content.save")}
        >
            <FiCheck />
        </Button>
        <ConfirmationModal
            buttonContent={t("manage.realm.content.cancel")}
            onSubmit={onCancel}
            ref={modalRef}
        >
            <p>{t("manage.realm.content.cancel-warning")}</p>
        </ConfirmationModal>
    </ButtonGroup>;
};
