import React, { Fragment, ReactNode, useId, useImperativeHandle, useRef, useState } from "react";
import { FiCheck, FiCopy } from "react-icons/fi";
import { WithTooltip } from "@opencast/appkit";

import { Button } from "./Button";
import { COLORS } from "../color";
import { timeStringToSeconds } from "../util";
import { focusStyle } from ".";


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
    ({ error = false, ...rest }, ref) => {
        const textAreaRef = useRef<HTMLTextAreaElement>(null);
        useImperativeHandle(ref, () => textAreaRef.current as HTMLTextAreaElement);
        const initialHeight = textAreaRef.current?.scrollHeight;

        const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            if (textAreaRef.current) {
                // Setting this to auto first prevents some weird behavior
                // where the textarea's height decreases by a small amount
                // whenever a single char is deleted.
                textAreaRef.current.style.height = "auto";
                textAreaRef.current.style.height = `${e.target.scrollHeight + 2}px`;
            }
        };

        return <textarea
            onInput={handleInput}
            ref={textAreaRef}
            css={{
                width: "100%",
                minHeight: 200,
                // We add 2px here and in the input handling to prevent the appearance
                // of an unnecessary scrollbar while the whole text is visible.
                ...initialHeight && { height: initialHeight + 2 },
                maxHeight: "50vh",
                resize: "none",
                padding: "8px 10px",
                ...style(error),
            }}
            {...rest}
        />;
    },
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
        css={{ marginRight: 8 }}
    />
    <label css={{
        color: checkboxChecked ? COLORS.neutral90 : COLORS.neutral70,
        fontSize: 14,
        marginRight: 6,
    }}>
        {label}
    </label>
    {input}
</div>;

type TimeInputProps = {
    timestamp: number;
    setTimestamp: (newTime: number) => void;
    disabled: boolean;
}

export type TimeUnit = "h" | "m" | "s";

/** A custom three-part input for time inputs split into hours, minutes and seconds */
export const TimeInput: React.FC<TimeInputProps> = ({ timestamp, setTimestamp, disabled }) => {
    const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

    const hours = Math.floor(timestamp / 3600);
    const minutes = Math.floor((timestamp % 3600) / 60);
    const seconds = Math.floor(timestamp % 60);

    const handleInput = (newValue: number, type: TimeUnit, index: number) => {
        if (isNaN(newValue) || newValue < 0 || newValue > 99) {
            return;
        }

        const cappedValue = Math.min(newValue, 59);
        const timeString = `${type === "h" ? cappedValue : hours}h`
            + `${type === "m" ? cappedValue : minutes}m`
            + `${type === "s" ? cappedValue : seconds}s`;

        setTimestamp(timeStringToSeconds(timeString));

        if (index < 2 && newValue > 9) {
            inputRefs.current[index + 1]?.focus();
        }
    };

    const handleArrowNavigation = (
        e: React.KeyboardEvent<HTMLInputElement>,
        index: number,
    ) => {
        const inputElement = inputRefs.current[index];

        if (e.key === "ArrowLeft" && index > 0 && inputElement?.selectionStart === 0) {
            e.preventDefault();
            inputRefs.current[index - 1]?.focus();
        }

        if (
            e.key === "ArrowRight" && index < inputRefs.current.length - 1
            && inputElement?.selectionStart === inputElement?.value.length
        ) {
            e.preventDefault();
            inputRefs.current[index + 1]?.focus();
        }
    };

    const entries: [number, TimeUnit][] = [
        [hours, "h"],
        [minutes, "m"],
        [seconds, "s"],
    ];

    return (
        <div css={{
            color: disabled ? COLORS.neutral70 : COLORS.neutral90,
            fontSize: 14,
            borderRadius: 4,
            padding: "0 2px",
            ":focus-within": {
                outline: `2.5px solid ${COLORS.focus}`,
            },
            ...!disabled && {
                outline: `1px solid ${COLORS.neutral20}`,
            },
        }}>
            {entries.map(([time, unit], index) => <Fragment key={`${unit}-input`}>
                <input
                    {...{ disabled }}
                    ref={ref => (inputRefs.current[index] = ref)}
                    value={time}
                    inputMode="numeric"
                    onChange={e => handleInput(Number(e.target.value), unit, index)}
                    onFocus={e => e.target.select()}
                    onKeyDown={e => handleArrowNavigation(e, index)}
                    css={{
                        width: time > 9 ? "2ch" : "1ch",
                        lineHeight: 1,
                        padding: 0,
                        border: 0,
                        outline: "none",
                        backgroundColor: "transparent",
                        userSelect: "all",
                        ":disabled": {
                            backgroundColor: "transparent",
                        },
                    }}
                />
                <span css={{ marginRight: 1 }}>{unit}</span>
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
