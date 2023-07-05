import React, { ReactNode } from "react";
import { COLORS } from "../../../../../../color";


export const Heading: React.FC<{ children: ReactNode }> = ({ children }) => <h3 css={{
    ":not(:first-of-type)": { marginTop: 12 },
    marginBottom: 8,
    fontSize: 18,
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
                border: `1px solid ${COLORS.neutral40}`,
                padding: "6px 12px",
                cursor: "pointer",
                backgroundColor: COLORS.neutral05,
            },
            "& > input:checked + div": {
                backgroundColor: COLORS.neutral10,
                outline: `2px solid ${COLORS.primary0}`,
                outlineOffset: -2,
                position: "relative", // Needed so that the outline is over sibling divs
            },
            // The attribute selector increases specificity
            ":focus-within div[role='button']": {
                backgroundColor: COLORS.neutral20,
                outline: `3px solid ${COLORS.primary0}`,
            },
            "& > input": {
                position: "absolute",
                opacity: 0, // Needed for the radio input to work for keyboard-only users
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
            <div role="button">{children}</div>
        </label>
    ),
);
