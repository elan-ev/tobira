import React, { useRef } from "react";
import { useTranslation } from "react-i18next";
import { graphql, useFragment } from "react-relay";
import { FiX, FiCheck } from "react-icons/fi";
import { useForm, useFormContext, FormProvider } from "react-hook-form";

import type {
    EditModeRealmData$key,
} from "./__generated__/EditModeRealmData.graphql";
import { currentRef, match } from "../../../../../../util";
import { Input } from "../../../../../../ui/Input";
import { Button } from "../../util";
import { ButtonGroup } from "..";
import { ConfirmationModal, ConfirmationModalHandle } from "../../../../../../ui/Modal";
import { EditTextBlock, TextFormData } from "./Text";
import { EditSeriesBlock, SeriesFormData } from "./Series";


type EditModeProps = {
    realm: EditModeRealmData$key;
    index: number;
    onCancel?: () => void;
    onSave?: () => void;
    onCompleted?: () => void;
    onError?: (error: Error) => void;
};

type BlockFormData = (
    { type: "TextBlock" } & TextFormData
) | (
    { type: "SeriesBlock" } & SeriesFormData
);

export type EditModeFormData = {
    title: string;
} & BlockFormData;

type ProcessFormData = {
    title: string | null;
} & BlockFormData;

export type EditModeRef = {
    save: (
        id: string,
        data: ProcessFormData,
        onCompleted?: () => void,
        onError?: (error: Error) => void,
    ) => void;
    create: (
        realm: string,
        index: number,
        data: ProcessFormData,
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
    const { t } = useTranslation();

    const { id: realmId, blocks } = useFragment(graphql`
        fragment EditModeRealmData on Realm {
            id
            blocks {
                id
                title
                __typename
                ... on TextBlock { ... TextEditModeBlockData }
                ... on SeriesBlock { ... SeriesEditModeBlockData }
            }
        }
    `, realmRef);
    const block = blocks[index];
    const { id, title, __typename: type } = block;


    const form = useForm<EditModeFormData>({
        defaultValues: {
            type: type as "TextBlock" | "SeriesBlock",
        },
    });
    const editModeRef = useRef<EditModeRef>(null);

    const onSubmit = form.handleSubmit(data => {
        // Empty titles should set the field to `null`
        // This is to avoid empty headings when rendering the block.
        // In the future we might want to check this at render site,
        // and we also might want more sophisticated checks
        // (like "all whitespace").
        const processData = { ...data, title: data.title || null };

        onSave?.();

        if (id.startsWith("cl")) {
            currentRef(editModeRef).create(
                realmId,
                index,
                processData,
                onCompleted,
                onError,
            );
        } else {
            currentRef(editModeRef).save(
                id,
                processData,
                onCompleted,
                onError,
            );
        }
    });


    return <FormProvider<EditModeFormData> {...form}>
        <form onSubmit={onSubmit}>
            <EditModeButtons onCancel={onCancel} />
            <h2 css={{ margin: "16px 0" }}>
                <Input
                    css={{ display: "block" }}
                    placeholder={t("manage.realm.content.title")}
                    defaultValue={title ?? ""}
                    {...form.register("title")}
                />
            </h2>
            {match(block.__typename, {
                "TextBlock": () => <EditTextBlock ref={editModeRef} block={block} />,
                "SeriesBlock": () => <EditSeriesBlock ref={editModeRef} block={block} />,
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
