import React, { useRef, useContext } from "react";
import { useTranslation } from "react-i18next";
import { graphql, useFragment } from "react-relay";
import { useForm, useFormContext, FormProvider } from "react-hook-form";
import { bug, match } from "@opencast/appkit";

import { ConfirmationModal, ConfirmationModalHandle } from "../../../../../../ui/Modal";
import { Button } from "../../../../../../ui/Button";
import { currentRef, useOnOutsideClick } from "../../../../../../util";
import type { EditModeRealmData$key } from "./__generated__/EditModeRealmData.graphql";
import type { EditModeFormRealmData$key } from "./__generated__/EditModeFormRealmData.graphql";
import { EditTitleBlock } from "./Title";
import { EditTextBlock } from "./Text";
import { EditSeriesBlock } from "./Series";
import { EditVideoBlock } from "./Video";
import FocusTrap from "focus-trap-react";


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


type EditModeFormProps<FormData, ApiData = FormData> = {
    save: (config: {
        variables: {
            id: string;
            set: ApiData;
        };
        onCompleted?: () => void;
        onError?: (error: Error) => void;
    }) => void;
    create: (config: {
        variables: {
            realm: string;
            index: number;
            block: ApiData;
        };
        onCompleted?: () => void;
        onError?: (error: Error) => void;
    }) => void;
    map: (data: FormData) => ApiData;
};

export const EditModeForm = <FormData extends object, ApiData extends object>(
    { save, create, children, map }: React.PropsWithChildren<EditModeFormProps<FormData, ApiData>>,
) => {
    const { realm: realmRef, index, onSave, onCancel, onCompleted, onError }
        = useContext(EditModeFormContext) ?? bug("missing context provider");

    const { t } = useTranslation();
    const { formState: { isDirty } } = useFormContext();
    const modalRef = useRef<ConfirmationModalHandle>(null);
    const ref = useRef<HTMLFormElement>(null);

    const handleOnCancel = () => {
        if (isDirty) {
            currentRef(modalRef).open();
        } else {
            onCancel?.();
        }
    };

    useOnOutsideClick(ref, () => handleOnCancel());

    const { id: realm, blocks } = useFragment(graphql`
        fragment EditModeFormRealmData on Realm {
            id
            blocks { id }
        }
    `, realmRef);
    const { id } = blocks[index];


    const form = useFormContext<FormData>();

    const onSubmit = form.handleSubmit(data => {
        onSave?.();

        if (id.startsWith("cl")) {
            create({
                variables: {
                    realm,
                    index,
                    block: map(data),
                },
                onCompleted,
                onError,
            });
        } else {
            save({
                variables: {
                    id,
                    set: map(data),
                },
                onCompleted,
                onError,
            });
        }
    });


    return <FormProvider<FormData> {...form}>
        <FocusTrap>
            <form ref={ref} onSubmit={onSubmit}>
                {children}
                <EditModeButtons onCancel={handleOnCancel} />
            </form>
        </FocusTrap>
        <ConfirmationModal
            title={t("manage.realm.content.confirm-cancel")}
            buttonContent={t("manage.realm.content.cancel")}
            onSubmit={onCancel}
            ref={modalRef}
            text={{ generalActionClose: t("general.action.close") }}
        >
            <p>{t("manage.realm.content.cancel-warning")}</p>
        </ConfirmationModal>
    </FormProvider>;
};


type EditModeButtonsProps = {
    onCancel: () => void;
};

const EditModeButtons: React.FC<EditModeButtonsProps> = ({ onCancel }) => {
    const { t } = useTranslation();

    return <div css={{
        marginTop: 12,
        display: "flex",
        justifyContent: "flex-end",
        gap: 12,
    }}>
        <Button
            kind="danger"
            onClick={onCancel}
        >
            {t("manage.realm.content.cancel")}
        </Button>
        <Button
            kind="happy"
            type="submit"
        >
            {t("general.action.save")}
        </Button>
    </div>;
};
