import {
    ReactNode,
    FormEvent,
    PropsWithChildren,
    forwardRef,
    useState,
    useRef,
    useImperativeHandle,
} from "react";
import { useTranslation } from "react-i18next";
import {
    bug,
    Modal as AppkitModal,
    ModalHandle as AppkitModalHandle,
    ModalProps as AppkitModalProps,
} from "@opencast/appkit";

import { Button } from "./Button";
import { Spinner } from "./Spinner";
import { boxError } from "./error";
import { currentRef } from "../util";


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


type ConfirmationModalProps = Omit<ModalProps, "closable" | "title"> & {
    title?: string;
    buttonContent: ReactNode;
    onSubmit?: () => void;
};

export type ConfirmationModalHandle = ModalHandle & {
    done: () => void;
    reportError: (error: JSX.Element) => void;
};

export const ConfirmationModal
    = forwardRef<ConfirmationModalHandle, PropsWithChildren<ConfirmationModalProps>>(
        ({
            title: titleOverride,
            buttonContent,
            onSubmit,
            children,
        }, ref) => {
            const { t } = useTranslation();
            const title = titleOverride ?? t("manage.are-you-sure") ?? bug("missing translation");

            const [inFlight, setInFlight] = useState(false);
            const [error, setError] = useState<JSX.Element | undefined>();

            const modalRef = useRef<ModalHandle>(null);

            useImperativeHandle(ref, () => ({
                open: () => {
                    setInFlight(false);
                    setError(undefined);
                    currentRef(modalRef).open();
                },
                done: () => {
                    currentRef(modalRef).close?.();
                },
                reportError: (error: JSX.Element) => {
                    setInFlight(false);
                    setError(error);
                },
            }));

            const onSubmitWrapper = (event: FormEvent) => {
                event.preventDefault();
                // Don't let the event escape the portal,
                //   which might be sitting inside of other `form` elements.
                event.stopPropagation();
                setInFlight(true);
                setError(undefined);
                onSubmit?.();
            };

            return <Modal title={title} closable={!inFlight} ref={modalRef}>
                {children}
                <form onSubmit={onSubmitWrapper} css={{ marginTop: 32 }}>
                    <div css={{
                        display: "flex",
                        gap: 12,
                        justifyContent: "center",
                        flexWrap: "wrap",
                    }}>
                        <Button disabled={inFlight} onClick={
                            () => currentRef(modalRef).close?.()
                        }>
                            {t("general.action.cancel")}
                        </Button>
                        <Button disabled={inFlight} type="submit" kind="danger" css={{
                            whiteSpace: "normal",
                        }}>
                            {buttonContent}
                        </Button>
                    </div>
                    {inFlight && <div css={{ marginTop: 16 }}><Spinner size={20} /></div>}
                </form>
                {boxError(error)}
            </Modal>;
        },
    );
