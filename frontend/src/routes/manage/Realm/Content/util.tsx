import React from "react";
import { focusStyle } from "../../../../ui";


type ButtonProps = React.ComponentProps<"button">;

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => (
    <button
        ref={ref}
        type="button"
        css={{
            display: "flex",
            padding: 6,
            alignItems: "center",
            border: "none",
            color: "var(--grey40)",
            backgroundColor: "inherit",
            transition: "background-color 0.15s, color 0.15s",
            "&[disabled]": {
                color: "var(--grey80)",
            },
            "&:not([disabled])": {
                cursor: "pointer",
                "&:hover, &:focus": {
                    color: "var(--accent-color)",
                    backgroundColor: "var(--grey97)",
                },
                ...focusStyle({}),
            },
        }}
        {...props}
    />
));

type ButtonGroupProps = React.ComponentProps<"div">;

export const ButtonGroup: React.FC<ButtonGroupProps> = props => (
    <div
        {...props}
        css={{
            fontSize: 18,
            display: "flex",
            alignItems: "center",
            border: "1px solid var(--grey80)",
            borderRadius: 4,
            "& > *": {
                display: "flex",
                color: "var(--grey40)",
                "&:not(:last-child)": {
                    borderRight: "1px solid var(--grey80)",
                },
                "&:last-child > button": {
                    borderTopRightRadius: 4,
                },
                "&:first-child > button": {
                    borderBottomLeftRadius: 4,
                },
            },
        }}
    />
);
