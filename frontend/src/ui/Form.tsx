export const Form: React.FC<React.JSX.IntrinsicElements["form"]> = ({ children, ...rest }) => (
    <form
        css={{
            "& label": {
                fontWeight: "bold",
                display: "block",
                marginBottom: 8,
            },
        }}
        {...rest}
    >{children}</form>
);
