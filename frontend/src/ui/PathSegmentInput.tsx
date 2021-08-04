import React from "react";
import { Input, Props as InputProps } from "./Input";
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
            <span css={{ paddingLeft: 8 }}>{base}</span>
            <Input
                css={{ margin: -1, width: 160 }}
                // TODO: I have no idea why, but this cast is necessary.
                // Otherwise TS complaints about type mismatch. By `ref` is
                // exactly the same type as what the `ref` attributes of
                // `Input` expects. Even taking the exact type of the error
                // messages "cannot be assigned to $ty" and saying `ref={ref as $ty}`
                // here does NOT fix it. Super weird.
                ref={ref as any}
                {...rest}
            />
            {spinner && <Spinner size={20} css={{ position: "absolute", right: 6 }}/>}
        </div>
    ),
);
