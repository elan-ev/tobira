import React from "react";
import { Input, InputProps } from "./Input";
import { Spinner } from "./Spinner";


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
            border: "1px solid var(--grey92)",
            borderRadius: 4,
            gap: 8,
            backgroundColor: "var(--grey97)",
        }}>
            <span css={{ paddingLeft: 8, overflow: "auto" }}>
                {base.split("/").join("\u200b/") + (base.endsWith("/") ? "" : "/")}
            </span>
            <Input
                css={{ margin: -1, width: 160 }}
                spellCheck={false}
                autoCapitalize="none"
                ref={ref}
                {...rest}
            />
            {spinner && <Spinner size={20} css={{ position: "absolute", right: 6 }}/>}
        </div>
    ),
);
