import { JSX } from "react";


export const Form: React.FC<JSX.IntrinsicElements["form"]> = ({ children, ...rest }) => (
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
