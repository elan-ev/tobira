import {
    ReactNode,
    FormEvent,
    PropsWithChildren,
    forwardRef,
    useState,
    useRef,
    useImperativeHandle,
    useEffect,
} from "react";
import ReactDOM from "react-dom";
import { FiX } from "react-icons/fi";

import { Button } from "./Button";
import { Spinner } from "./Spinner";
import { boxError } from "./error";


type ModalProps = {
    title: string;
    closable?: boolean;
};

export type ModalHandle = {
    open: () => void;
    close?: () => void;
};

export const Modal = forwardRef<ModalHandle, PropsWithChildren<ModalProps>>(({
    title,
    closable = true,
    children,
}, ref) => {
    const [isOpen, setOpen] = useState(false);

    useImperativeHandle(ref, () => ({
        open: () => setOpen(true),
        close: closable ? (() => setOpen(false)) : undefined,
    }));

    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (closable && event.key === "Escape") {
                setOpen(false);
            }
        };
        window.addEventListener("keydown", handleEscape);
        return () => window.removeEventListener("keydown", handleEscape);
    }, [closable]);

    return ReactDOM.createPortal(
        isOpen && <div
            {...(closable && { onClick: e => {
                if (e.target === e.currentTarget) {
                    setOpen(false);
                }
            } })}
            onKeyUp={event => {
                if (event.key === "Escape" && closable) {
                    console.log("foo");
                    setOpen(false);
                }
            }}
            css={{
                position: "fixed",
                top: 0,
                bottom: 0,
                left: 0,
                right: 0,
                backgroundColor: "rgba(0, 0, 0, 0.8)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                zIndex: 2000,
            }}
        >
            <div css={{
                backgroundColor: "white",
                borderRadius: 4,
                width: 400,
                maxWidth: "100%",
                margin: 16,
            }}>
                <div css={{
                    padding: "12px 16px",
                    borderBottom: "1px solid var(--grey80)",
                    display: "flex",
                    alignItems: "center",
                }}>
                    <h2 css={{ flex: "1" }}>{title}</h2>
                    {closable && <div
                        onClick={() => setOpen(false)}
                        css={{ fontSize: 32, cursor: "pointer", display: "inline-flex" }}
                    ><FiX /></div>}
                </div>
                <div css={{ padding: 16 }}>{children}</div>
            </div>
        </div>,
        document.body,
    );
});


type ConfirmationModalProps = Omit<ModalProps, "closable"> & {
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
            title,
            buttonContent,
            onSubmit,
            children,
        }, ref) => {
            const [inFlight, setInFlight] = useState(false);
            const [error, setError] = useState<JSX.Element | undefined>();

            const modalRef = useRef<ModalHandle>(null);

            useImperativeHandle(ref, () => ({
                open: () => {
                    setInFlight(false);
                    setError(undefined);
                    modalRef.current?.open();
                },
                done: () => {
                    modalRef.current?.close?.();
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
                <form onSubmit={onSubmitWrapper} css={{ marginTop: 32, textAlign: "center" }}>
                    <Button autoFocus={true} disabled={inFlight} type="submit" kind="danger">
                        {buttonContent}
                    </Button>
                    {inFlight && <div css={{ marginTop: 16 }}><Spinner size={20} /></div>}
                </form>
                {boxError(error)}
            </Modal>;
        },
    );
