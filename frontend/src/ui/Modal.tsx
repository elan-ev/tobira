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
import { LuX } from "react-icons/lu";
import { useTranslation } from "react-i18next";
import FocusTrap from "focus-trap-react";
import { bug, useColorScheme, ProtoButton } from "@opencast/appkit";

import { Button } from "./Button";
import { Spinner } from "./Spinner";
import { boxError } from "./error";
import { currentRef } from "../util";
import { focusStyle } from ".";
import { COLORS } from "../color";


type ModalProps = {
    title: string;
    closable?: boolean;
    className?: string;
    closeOnOutsideClick?: boolean;
};

export type ModalHandle = {
    open: () => void;
    close?: () => void;
    isOpen?: () => boolean;
};

export const Modal = forwardRef<ModalHandle, PropsWithChildren<ModalProps>>(({
    title,
    closable = true,
    children,
    className,
    closeOnOutsideClick = false,
}, ref) => {
    const { t } = useTranslation();
    const [isOpen, setOpen] = useState(false);
    const isDark = useColorScheme().scheme === "dark";

    useImperativeHandle(ref, () => ({
        isOpen: () => isOpen,
        open: () => setOpen(true),
        close: () => setOpen(false),
    }), [isOpen, closable]);

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
        isOpen && <FocusTrap>
            <div
                {...(closable && closeOnOutsideClick && { onClick: e => {
                    if (e.target === e.currentTarget) {
                        setOpen(false);
                    }
                } })}
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
                    zIndex: 10001,
                }}
            >
                <div {...{ className }} css={{
                    backgroundColor: COLORS.neutral05,
                    borderRadius: 4,
                    minWidth: "clamp(300px, 90%, 400px)",
                    margin: 16,
                    ...isDark && {
                        border: `1px solid ${COLORS.neutral25}`,
                    },
                }}>
                    <div css={{
                        padding: "12px 16px",
                        borderBottom: `1px solid ${COLORS.neutral25}`,
                        display: "flex",
                        alignItems: "center",
                    }}>
                        <h2 css={{ flex: 1 }}>{title}</h2>
                        {closable && <ProtoButton
                            aria-label={t("general.action.close")}
                            tabIndex={0}
                            onClick={() => setOpen(false)}
                            css={{
                                fontSize: 32,
                                cursor: "pointer",
                                display: "inline-flex",
                                borderRadius: 4,
                                ...focusStyle({}),
                            }}
                        ><LuX /></ProtoButton>}
                    </div>
                    <div css={{ padding: 16 }}>{children}</div>
                </div>
            </div>
        </FocusTrap>,
        document.body,
    );
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
