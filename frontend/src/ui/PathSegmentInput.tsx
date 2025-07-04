import React from "react";
import { Input, InputProps } from "./Input";
import { Spinner } from "@opencast/appkit";
import { COLORS } from "../color";


type Props = InputProps & {
    base: string;
    spinner?: boolean;
};

export const PathSegmentInput = React.forwardRef<HTMLInputElement, Props>(
    ({ base, spinner = false, ...rest }, ref) => (
        <div css={{
            display: "inline-flex",
            flexWrap: "wrap",
            position: "relative",
            alignItems: "center",
            justifyContent: "center",
            border: `1px solid ${COLORS.neutral15}`,
            borderRadius: 4,
            gap: 8,
            backgroundColor: COLORS.neutral10,
        }}>
            <span css={{ paddingLeft: 8, overflow: "auto" }}>
                {base.split("/").join("\u200b/") + (base.endsWith("/") ? "" : "/")}
            </span>
            <Input
                css={{ margin: -1, width: 160 }}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="none"
                ref={ref}
                {...rest}
            />
            {spinner && <Spinner size={20} css={{ position: "absolute", right: 6 }}/>}
        </div>
    ),
);
