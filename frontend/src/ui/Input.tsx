import React from "react";


const style = (error: boolean) => ({
    borderRadius: 4,
    border: `1px solid ${error ? "var(--danger-color)" : "var(--grey80)"}`,
    "&:focus": {
        outline: "none",
        boxShadow: "0 0 0 1px var(--accent-color)",
        borderColor: "var(--accent-color)",
    },
});

export type Props = JSX.IntrinsicElements["input"] & {
    error?: boolean;
};

/** A styled single-line text box */
export const Input = React.forwardRef<HTMLInputElement, Props>(
    ({ error = false, ...rest }, ref) => (
        <input
            ref={ref}
            css={{ padding: "4px 10px", ...style(error) }}
            {...rest}
        />
    ),
);

export type TextAreaProps = JSX.IntrinsicElements["textarea"] & {
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
