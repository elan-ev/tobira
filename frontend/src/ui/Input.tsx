import React, { Fragment, ReactNode, useId, useState } from "react";
import { FiCheck, FiCopy } from "react-icons/fi";
import { WithTooltip } from "@opencast/appkit";

import { focusStyle } from ".";
import { Button } from "./Button";
import { COLORS } from "../color";


const style = (error: boolean) => ({
    borderRadius: 4,
    border: `1px solid ${error ? COLORS.danger0 : COLORS.neutral25}`,
    ":focus-visible": { borderColor: COLORS.focus },
    ...focusStyle({ offset: -1 }),
});

export type InputProps = React.ComponentPropsWithoutRef<"input"> & {
    error?: boolean;
};

/** A styled single-line text box */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ error = false, ...rest }, ref) => (
        <input
            ref={ref}
            css={{ padding: "4px 10px", ...style(error) }}
            {...rest}
        />
    ),
);

export type TextAreaProps = React.ComponentPropsWithoutRef<"textarea"> & {
    error?: boolean;
};

/** A styled multi-line text area */
export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
    ({ error = false, ...rest }, ref) => (
        <textarea
            ref={ref}
            css={{
                width: "100%",
                height: 200,
                resize: "none",
                padding: "8px 10px",
                ...style(error),
            }}
            {...rest}
        />
    ),
);

type InputWithCheckboxProps = {
    checkboxChecked: boolean;
    setCheckboxChecked: (newValue: boolean) => void;
    label: string;
    input: ReactNode;
}

/** Checkbox with a label to enable/disable an adjacent input */
export const InputWithCheckbox: React.FC<InputWithCheckboxProps> = (
    { checkboxChecked, setCheckboxChecked, label, input }
) => <div css={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
    <input
        type="checkbox"
        checked={checkboxChecked}
        onChange={() => setCheckboxChecked(!checkboxChecked)}
        css={{ margin: "0 4px" }}
    />
    <label css={{ color: COLORS.neutral90, fontSize: 14 }}>
        {label}
    </label>
    {input}
</div>;

type TimeInputProps = {
    timestamp: string;
    setTimestamp: (newTime: string) => void;
    disabled: boolean;
}

/** A custom three-part input for time inputs split into hours, minutes and seconds */
export const TimeInput: React.FC<TimeInputProps> = ({ timestamp, setTimestamp, disabled }) => {
    const timeParts = (/(\d+h)?(\d+m)?(\d+s)?/).exec(timestamp)?.slice(1) ?? [];
    const [hours, minutes, seconds] = timeParts
        .map(part => part ? parseInt(part.replace(/\D/g, "")) : 0);

    const handleTimeChange = (newValue: number, type: TimeUnit) => {
        if (isNaN(newValue)) {
            return;
        }

        const cappedValue = Math.min(newValue, 59);
        const newTimestamp = `${type === "h" ? cappedValue : hours}h`
            + `${type === "m" ? cappedValue : minutes}m`
            + `${type === "s" ? cappedValue : seconds}s`;

        setTimestamp(newTimestamp);
    };

    type TimeUnit = "h" | "m" | "s";
    const entries: [number, TimeUnit][] = [
        [hours, "h"],
        [minutes, "m"],
        [seconds, "s"],
    ];

    return (
        <div css={{ color: disabled ? COLORS.neutral70 : COLORS.neutral90 }}>
            {entries.map(([time, unit]) => <Fragment key={`${unit}-input`}>
                <input
                    {...{ disabled }}
                    value={time}
                    maxLength={2}
                    onChange={e => handleTimeChange(Number(e.target.value), unit)}
                    css={{
                        width: time > 9 ? 24 : "2ch",
                        lineHeight: 1,
                        padding: 0,
                        border: 0,
                        textAlign: "center",
                        borderRadius: 4,
                        outline: `1px solid ${COLORS.neutral20}`,
                        outlineOffset: "-2px",
                        userSelect: "all",
                        ...focusStyle({ inset: true }),
                        ":disabled": {
                            textAlign: "right",
                            backgroundColor: "transparent",
                            outline: "none",
                        },
                    }}
                />
                <span>{unit}</span>
            </Fragment>)}
        </div>
    );
};

export type SelectProps = React.ComponentPropsWithoutRef<"select"> & {
    error?: boolean;
};

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
    ({ error = false, ...rest }, ref) => (
        <select
            ref={ref}
            css={{
                padding: "4px 10px",
                ...style(error),
            }}
            {...rest}
        />
    ),
);

type CopyableInputProps = JSX.IntrinsicElements["div"] & {
    value: string;
    label: string;
    multiline?: boolean;
};

export const CopyableInput: React.FC<CopyableInputProps> = ({
    value,
    label,
    multiline = false,
    ...rest
}) => {
    const [wasCopied, setWasCopied] = useState(false);
    const copy = async () => {
        await navigator.clipboard.writeText(value);
        setWasCopied(true);
    };

    const copyableInputId = useId();
    const sharedStyle = {
        ...style(false),
        fontFamily: "monospace",
        width: "100%",
        height: "100%",
        padding: "4px 50px 4px 10px",
    };
    const sharedProps = {
        disabled: true,
        value,
        "aria-labelledby": label,
    };
    const inner = multiline
        ? <textarea {...sharedProps} css={{
            ...sharedStyle,
            overflow: "auto",
            resize: "none",
            color: COLORS.neutral90,
            "::-webkit-scrollbar": { display: "none" },
            scrollbarWidth: "none",
        }} />
        : <input {...sharedProps} css={sharedStyle} />;

    return (
        <div id={copyableInputId} css={{
            position: "relative",
            height: multiline ? 95 : 34,
            maxWidth: "100%",
        }} {...rest}>
            <div css={{ position: "absolute", top: 0, right: 0, zIndex: 10 }}>
                <WithTooltip tooltip={label} css={{ fontFamily: "var(--main-font), sans-serif" }}>
                    <Button
                        aria-label={label}
                        kind="happy"
                        onClick={copy}
                        css={{
                            paddingLeft: 10,
                            paddingRight: 10,
                            borderRadius: 4,
                            borderTopLeftRadius: 0,
                            height: 34,
                            ...multiline
                                ? { borderBottomRightRadius: 0 }
                                : { borderBottomLeftRadius: 0 },
                        }}
                    >
                        {wasCopied ? <FiCheck /> : <FiCopy />}
                    </Button>
                </WithTooltip>
            </div>
            {inner}
        </div>
    );
};
