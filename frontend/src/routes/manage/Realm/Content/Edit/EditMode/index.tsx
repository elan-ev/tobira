import React, { useRef, useContext } from "react";
import { useTranslation } from "react-i18next";
import { graphql, useFragment } from "react-relay";
import { useForm, useFormContext, FormProvider, UnpackNestedValue } from "react-hook-form";

import { ConfirmationModal, ConfirmationModalHandle } from "../../../../../../ui/Modal";
import { Button } from "../../../../../../ui/Button";
import { currentRef, match } from "../../../../../../util";
import { bug } from "../../../../../../util/err";
import type { EditModeRealmData$key } from "./__generated__/EditModeRealmData.graphql";
import type { EditModeFormRealmData$key } from "./__generated__/EditModeFormRealmData.graphql";
import { EditTitleBlock } from "./Title";
import { EditTextBlock } from "./Text";
import { EditSeriesBlock } from "./Series";
import { EditVideoBlock } from "./Video";


type EditModeProps = {
    realm: EditModeRealmData$key;
    index: number;
    onCancel?: () => void;
    onSave?: () => void;
    onCompleted?: () => void;
    onError?: (error: Error) => void;
};

type EditModeFormContextContent =
    Omit<EditModeProps, "realm"> & { realm: EditModeFormRealmData$key };

const EditModeFormContext = React.createContext<EditModeFormContextContent | null>(null);

export const EditMode: React.FC<EditModeProps> = props => {
    const { realm: realmRef, index } = props;
    const result = useFragment(graphql`
        fragment EditModeRealmData on Realm {
            blocks {
                # Querying only the type and the fragments bugs out Relay type generation
                id
                __typename
                ... on TitleBlock { ...TitleEditModeBlockData }
                ... on TextBlock { ...TextEditModeBlockData }
                ... on SeriesBlock { ...SeriesEditModeBlockData }
                ... on VideoBlock { ...VideoEditModeBlockData }
            }
            ...EditModeFormRealmData
        }
    `, realmRef);
    const block = result.blocks[index];
    const { __typename: type } = block;

    const form = useForm();

    return <EditModeFormContext.Provider value={{ ...props, realm: result }}>
        <FormProvider {...form}>
            {match(type, {
                TitleBlock: () => <EditTitleBlock block={block} />,
                TextBlock: () => <EditTextBlock block={block} />,
                SeriesBlock: () => <EditSeriesBlock block={block} />,
                VideoBlock: () => <EditVideoBlock block={block} />,
            }, () => bug("unknown block type"))}
        </FormProvider>
    </EditModeFormContext.Provider>;
};


type EditModeFormProps<T> = {
    save: (config: {
        variables: {
            id: string;
            set: UnpackNestedValue<T>;
        };
        onCompleted?: () => void;
        onError?: (error: Error) => void;
    }) => void;
    create: (config: {
        variables: {
            realm: string;
            index: number;
            block: UnpackNestedValue<T>;
        };
        onCompleted?: () => void;
        onError?: (error: Error) => void;
    }) => void;
};

export const EditModeForm = <T extends object, >(
    { save, create, children }: React.PropsWithChildren<EditModeFormProps<T>>,
) => {
    const { realm: realmRef, index, onSave, onCancel, onCompleted, onError }
        = useContext(EditModeFormContext) ?? bug("missing context provider");


    const { id: realm, blocks } = useFragment(graphql`
        fragment EditModeFormRealmData on Realm {
            id
            blocks { id }
        }
    `, realmRef);
    const { id } = blocks[index];


    const form = useFormContext<T>();

    const onSubmit = form.handleSubmit(data => {
        onSave?.();

        if (id.startsWith("cl")) {
            create({
                variables: {
                    realm,
                    index,
                    block: data,
                },
                onCompleted,
                onError,
            });
        } else {
            save({
                variables: {
                    id,
                    set: data,
                },
                onCompleted,
                onError,
            });
        }
    });


    return <FormProvider<T> {...form}>
        <form onSubmit={onSubmit}>
            {children}
            <EditModeButtons onCancel={onCancel} />
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

    return <div css={{
        marginTop: 8,
        display: "flex",
        justifyContent: "space-between",
    }}>
        <Button
            kind="danger"
            onClick={() => {
                if (isDirty) {
                    currentRef(modalRef).open();
                } else {
                    onCancel?.();
                }
            }}
        >
            {t("manage.realm.content.cancel")}
        </Button>
        <Button
            kind="happy"
            type="submit"
        >
            {t("manage.realm.content.save")}
        </Button>
        <ConfirmationModal
            buttonContent={t("manage.realm.content.cancel")}
            onSubmit={onCancel}
            ref={modalRef}
        >
            <p>{t("manage.realm.content.cancel-warning")}</p>
        </ConfirmationModal>
    </div>;
};
