import { FiAlertTriangle } from "react-icons/fi";
import { match } from "../util";


type Props = JSX.IntrinsicElements["div"] & {
    kind: "error";
    iconPos?: "left" | "top";
};

/** A styled container for different purposes */
export const Card: React.FC<Props> = ({ kind, iconPos = "left", children, ...rest }) => (
    <div
        css={{
            display: "inline-flex",
            flexDirection: iconPos === "left" ? "row" : "column",
            borderRadius: 4,
            padding: "8px 16px",
            background: "var(--danger-color)",
            color: "white",
            gap: 16,
            alignItems: "center",
            "& > svg": {
                fontSize: 24,
                minWidth: 24,
            },
            ...match(kind, {
                "error": () => ({
                    border: "1.5px solid var(--danger-color)",
                }),
            }),
        }}
        {...rest}
    >
        {match(kind, {
            "error": () => <FiAlertTriangle />,
        })}
        <div>{children}</div>
    </div>
);
