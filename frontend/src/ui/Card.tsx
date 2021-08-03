import { FiAlertTriangle } from "react-icons/fi";
import { match } from "../util";


type Props = {
    kind: "error";
};

/** A styled container for different purposes */
export const Card: React.FC<Props> = ({ kind, children }) => (
    <div css={{
        display: "inline-flex",
        borderRadius: 4,
        padding: "8px 16px",
        background: "var(--danger-color)",
        color: "white",
        gap: 16,
        alignItems: "center",
        "& > svg": {
            fontSize: 24,
        },
        ...match(kind, {
            "error": () => ({
                border: "1.5px solid var(--danger-color)",
            }),
        }),
    }}>
        {match(kind, {
            "error": () => <FiAlertTriangle />,
        })}
        {children}
    </div>
);
