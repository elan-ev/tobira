import { PropsWithChildren, forwardRef } from "react";
import { useTranslation } from "react-i18next";
import {
    Modal as AppkitModal,
    ModalHandle as AppkitModalHandle,
    ModalProps as AppkitModalProps,
    ConfirmationModal as AppkitConfirmationModal,
    ConfirmationModalHandle as AppkitConfirmationModalHandle,
    ConfirmationModalProps as AppkitConfirmationModalProps,
} from "@opencast/appkit";



type ModalProps = PropsWithChildren<Omit<AppkitModalProps, "text">>;
export type ModalHandle = AppkitModalHandle;

export const Modal = forwardRef<ModalHandle, ModalProps>((props, ref) => {
    const { t } = useTranslation();
    return <AppkitModal
        ref={ref}
        text={{ close: t("general.action.close") }}
        {...props}
    />;
});


type ConfirmationModalProps = PropsWithChildren<Omit<AppkitConfirmationModalProps, "text">>;
export type ConfirmationModalHandle = AppkitConfirmationModalHandle;

export const ConfirmationModal
    = forwardRef<ConfirmationModalHandle, ConfirmationModalProps>((props, ref) => {
        const { t } = useTranslation();
        return <AppkitConfirmationModal
            ref={ref}
            text={{
                cancel: t("general.action.cancel"),
                close: t("general.action.close"),
                areYouSure: t("general.action.are-you-sure"),
            }}
            {...props}
        />;
    });
