import React from "react";


type ButtonProps = React.ComponentProps<"button">;

export const Button: React.FC<ButtonProps> = props => (
    <button
        type="button"
        css={{
            display: "flex",
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
            },
        }}
        {...props}
    />
);

type ButtonGroupProps = React.ComponentProps<"div">;

export const ButtonGroup: React.FC<ButtonGroupProps> = props => (
    <div
        {...props}
        css={{
            fontSide: 20,
            display: "flex",
            alignItems: "center",
            border: "1px solid var(--grey80)",
            borderRadius: 4,
            overflow: "hidden",
            "& > *": {
                display: "flex",
                color: "var(--grey40)",
                padding: 6,
                "&:not(:last-child)": {
                    borderRight: "1px solid var(--grey80)",
                },
            },
        }}
    />
);
