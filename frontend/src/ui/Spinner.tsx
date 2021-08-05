import { keyframes } from "@emotion/react";
import { IntrinsicElements } from "react-markdown/src/ast-to-react";


type Props = IntrinsicElements["svg"] & {
    size: number;
};

export const Spinner: React.FC<Props> = ({ size, ...rest }) => (
    <svg
        viewBox="0 0 50 50"
        css={{
            width: size,
            height: size,
            animation: `2s linear infinite none ${keyframes({
                "0%": { transform: "rotate(0)" },
                "100%": { transform: "rotate(360deg)" },
            })}`,
            "& > circle": {
                fill: "none",
                stroke: "black",
                strokeWidth: 4,
                strokeDasharray: 83, // 2/3 of circumference
                strokeLinecap: "round",
            },

        }}
        {...rest}
    >
        <circle cx="25" cy="25" r="20" />
    </svg>
);
