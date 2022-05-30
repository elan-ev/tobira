import { FiAlertTriangle, FiInfo } from "react-icons/fi";
import { match } from "../util";


type Props = JSX.IntrinsicElements["div"] & {
    kind: "error" | "info";
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
            gap: 16,
            alignItems: "center",
            "& > svg": {
                fontSize: 24,
                minWidth: 24,
            },
            ...match(kind, {
                "error": () => ({
                    backgroundColor: "var(--danger-color)",
                    border: "1.5px solid var(--danger-color)",
                    color: "var(--danger-color-bw-contrast)",
                }) as Record<string, string>,
                "info": () => ({
                    backgroundColor: "var(--grey97)",
                }),
            }),
        }}
        {...rest}
    >
        {match(kind, {
            "error": () => <FiAlertTriangle />,
            "info": () => <FiInfo css={{ color: "var(--grey40)" }} />,
        })}
        <div>{children}</div>
    </div>
);
