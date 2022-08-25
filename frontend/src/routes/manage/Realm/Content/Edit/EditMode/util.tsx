import React, { ReactNode } from "react";


export const Heading: React.FC<{ children: ReactNode }> = ({ children }) => <h3 css={{
    marginTop: 8,
    marginBottom: 4,
}}>
    {children}
</h3>;


type NiceRadioProps = React.PropsWithChildren<{
    breakpoint: number;
}>;

/**
 * A form input element letting the user chose between different options.
 * `children` should be a list of `NiceRadioOption`.
 */
export const NiceRadio: React.FC<NiceRadioProps> = ({ children, breakpoint }) => (
    // Getting this styled with CSS is quite fiddly mainly due to border radius.
    <div css={{
        display: "inline-flex",
        [`@media (max-width: ${breakpoint}px)`]: {
            flexDirection: "column",
        },

        "& > label": {
            "& > div": {
                border: "1px solid var(--grey65)",
                padding: "6px 12px",
                cursor: "pointer",
                height: "100%",
                backgroundColor: "white",
            },
            "& > input:checked + div": {
                backgroundColor: "var(--grey95)",
                outline: "2px solid var(--accent-color)",
                outlineOffset: -2,
                position: "relative", // Needed so that the outline is over sibling divs
            },
            "& > input": {
                display: "none",
            },
            [`@media (max-width: ${breakpoint}px)`]: {
                "&:first-child > div": {
                    borderRadius: "8px 8px 0 0",
                },
                "&:last-child > div": {
                    borderRadius: "0 0 8px 8px",
                },
                "&:not(:first-child) > div": {
                    marginTop: -1,
                },
            },
            [`@media not all and (max-width: ${breakpoint}px)`]: {
                ":first-child > div": {
                    borderRadius: "8px 0 0 8px",
                },
                "&:last-child > div": {
                    borderRadius: "0 8px 8px 0",
                },
                "&:not(:first-child) > div": {
                    marginLeft: -1,
                },
            },
        },
    }}>{children}</div>
);



type NiceRadioOptionProps = React.PropsWithChildren<JSX.IntrinsicElements["input"]>;

export const NiceRadioOption = React.forwardRef<HTMLInputElement, NiceRadioOptionProps>(
    ({ children, ...rest }, ref) => (
        <label>
            <input type="radio" ref={ref} {...rest} />
            <div>{children}</div>
        </label>
    ),
);
