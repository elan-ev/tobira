import { Link } from "../router";


type ButtonProps = JSX.IntrinsicElements["button"] & {
    danger?: boolean;
};

/** A styled button */
export const Button: React.FC<ButtonProps> = ({ danger = false, children, ...rest }) => (
    <button css={css(danger)} {...rest}>{children}</button>
);

type LinkButtonProps = JSX.IntrinsicElements["a"] & {
    to: string;
    danger?: boolean;
};

export const LinkButton: React.FC<LinkButtonProps> = ({
    danger = false,
    to,
    children,
    ...rest
}) => (
    <Link to={to} css={css(danger)} {...rest}>{children}</Link>
);

const css = (danger: boolean) => ({
    borderRadius: 4,
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    gap: 12,
    backgroundColor: "var(--grey97)",
    transition: "background-color 0.15s, border-color 0.15s",
    "& > svg": {
        fontSize: 20,
    },
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
});
