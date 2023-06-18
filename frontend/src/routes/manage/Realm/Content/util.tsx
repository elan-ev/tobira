import React from "react";
import { focusStyle } from "../../../../ui";
import { COLORS, useColorScheme } from "../../../../color";


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
            color: COLORS.grey6,
            backgroundColor: "inherit",
            transition: "background-color 0.15s, color 0.15s",
            "&[disabled]": {
                color: COLORS.grey4,
            },
            "&:not([disabled])": {
                cursor: "pointer",
                "&:hover, &:focus": {
                    backgroundColor: COLORS.grey0,
                    ...useColorScheme().scheme === "dark" && {
                        backgroundColor: COLORS.grey2,
                        color: COLORS.grey7,
                    },
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
            border: `1px solid ${COLORS.grey4}`,
            borderRadius: 4,
            "& > *": {
                display: "flex",
                color: COLORS.grey6,
                "&:not(:last-child)": {
                    borderRight: `1px solid ${COLORS.grey4}`,
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
