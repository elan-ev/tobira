import { FiAlertTriangle, FiInfo } from "react-icons/fi";
import { match } from "@opencast/appkit";

import { COLORS } from "../color";


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
                    backgroundColor: COLORS.danger0,
                    border: `1.5px solid ${COLORS.danger0}`,
                    color: COLORS.danger0BwInverted,
                }) as Record<string, string>,
                "info": () => ({
                    backgroundColor: COLORS.neutral10,
                }),
            }),
        }}
        {...rest}
    >
        {match(kind, {
            "error": () => <FiAlertTriangle />,
            "info": () => <FiInfo css={{ color: COLORS.neutral60 }} />,
        })}
        <div>{children}</div>
    </div>
);
