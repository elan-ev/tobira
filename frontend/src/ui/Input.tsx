type Props = JSX.IntrinsicElements["input"] & {
    error?: boolean;
};


/** A styled single-line text box */
export const Input: React.FC<Props> = ({ error = false, ...rest }) => (
    <input
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
);
