import React from "react";

type Props = JSX.IntrinsicElements["input"] & {
    error?: boolean;
};


/** A styled single-line text box */
export const Input = React.forwardRef<HTMLInputElement, Props>(
    ({ error = false, ...rest }, ref) => (
        <input
            ref={ref}
            css={{
                borderRadius: 4,
                padding: "4px 10px",
                border: `1px solid ${error ? "var(--danger-color)" : "var(--grey80)"}`,
                "&:focus": {
                    outline: "none",
                    boxShadow: "0 0 0 1px var(--accent-color)",
                    borderColor: "var(--accent-color)",
                },
            }}
            {...rest}
        />
    ),
);
