import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { FiCheck, FiCopy } from "react-icons/fi";
import { Button } from "./Button";


const style = (error: boolean) => ({
    borderRadius: 4,
    border: `1px solid ${error ? "var(--danger-color)" : "var(--grey80)"}`,
    "&:focus": {
        outline: "none",
        boxShadow: "0 0 0 1px var(--accent-color)",
        borderColor: "var(--accent-color)",
    },
});

export type InputProps = React.ComponentPropsWithoutRef<"input"> & {
    error?: boolean;
};

/** A styled single-line text box */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ error = false, ...rest }, ref) => (
        <input
            ref={ref}
            css={{ padding: "4px 10px", ...style(error) }}
            {...rest}
        />
    ),
);

export type TextAreaProps = React.ComponentPropsWithoutRef<"textarea"> & {
    error?: boolean;
};

/** A styled multi-line text area */
export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
    ({ error = false, ...rest }, ref) => (
        <textarea
            ref={ref}
            css={{
                width: "100%",
                height: 200,
                resize: "none",
                padding: "8px 10px",
                ...style(error),
            }}
            {...rest}
        />
    ),
);

export type SelectProps = React.ComponentPropsWithoutRef<"select"> & {
    error?: boolean;
};

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
    ({ error = false, ...rest }, ref) => (
        <select
            ref={ref}
            css={{
                padding: "8px 10px",
                ...style(error),
            }}
            {...rest}
        />
    ),
);

type CopyableInputProps = JSX.IntrinsicElements["div"] & {
    value: string;
};

export const CopyableInput: React.FC<CopyableInputProps> = ({ value, ...rest }) => {
    const { t } = useTranslation();

    const [wasCopied, setWasCopied] = useState(false);
    const copy = async () => {
        await navigator.clipboard.writeText(value);
        setWasCopied(true);
    };

    return (
        <div css={{ display: "flex" }} {...rest}>
            <input disabled value={value} css={{
                ...style(false),
                padding: "4px 10px",
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
                verticalAlign: "bottom",
                borderRight: "none",
                flex: "1",
            }} />
            {/* TODO: use BaseButton or sth once merged */}
            <Button
                kind="happy"
                onClick={copy}
                title={t("copy-to-clipboard")}
                css={{
                    borderTopLeftRadius: 0,
                    borderBottomLeftRadius: 0,
                    height: 34,
                }}
            >
                {wasCopied ? <FiCheck /> : <FiCopy />}
            </Button>
        </div>
    );
};
