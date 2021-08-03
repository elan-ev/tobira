type Props = JSX.IntrinsicElements["button"] & {
    danger?: boolean;
};

/** A styled button */
export const Button: React.FC<Props> = ({ danger = false, children, ...rest }) => (
    <button
        css={{
            borderRadius: 4,
            padding: "4px 10px",
            backgroundColor: "var(--grey97)",
            transition: "background-color 0.15s, border-color 0.15s",
            "&:disabled": {
                border: "1px solid var(--grey80)",
                color: "var(--grey65)",
            },
            "&:not([disabled])": {
                border: `1px solid ${danger ? "var(--danger-color)" : "var(--grey65)"}`,
                cursor: "pointer",
                color: danger ? "var(--danger-color)" : "black",
                "&:hover": danger
                    ? {
                        border: "1px solid var(--danger-color-darker)",
                        backgroundColor: "var(--danger-color)",
                        color: "white",
                    }
                    : {
                        border: "1px solid var(--grey40)",
                        backgroundColor: "var(--grey92)",
                    },
            },
        }}
        {...rest}
    >{children}</button>
);
