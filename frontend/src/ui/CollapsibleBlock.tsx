import { CSSObject } from "@emotion/react";
import { ProtoButton } from "@opencast/appkit";
import React, { useEffect, useRef, useState } from "react";
import { COLORS } from "../color";


export type Props = React.PropsWithChildren<{
    className?: string,
    maxHeight: number,
    paddingBottom?: number,
    gradientHeight?: number,
    backgroundColor?: string,
    buttonHoverBackgroundColor?: string,
    buttonCss?: CSSObject,
    buttonLabel: (expanded: boolean) => string,
}>;

export const CollapsibleBlock: React.FC<Props> = ({
    children,
    className,
    maxHeight,
    paddingBottom = 24,
    gradientHeight = 24,
    backgroundColor = COLORS.neutral05,
    buttonHoverBackgroundColor = COLORS.neutral20,
    buttonCss,
    buttonLabel,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    const [expanded, setExpanded] = useState(false);
    const [showButton, setShowButton] = useState(true);

    const resizeObserver = new ResizeObserver(() => {
        if (contentRef.current && containerRef.current) {
            const overflow = contentRef.current.scrollHeight > containerRef.current.offsetHeight;
            setShowButton(overflow || expanded);
        }
    });

    useEffect(() => {
        if (contentRef.current) {
            resizeObserver.observe(contentRef.current);
        }

        return () => resizeObserver.disconnect();
    });

    return (
        <div ref={containerRef} {...{ className }} css={{
            position: "relative",
            overflow: "hidden",
            ...!expanded && { maxHeight },
        }}>
            {/* Content */}
            <div ref={contentRef}>
                {children}
                <div css={{ paddingBottom }} />
            </div>

            {/* Gradient */}
            {showButton && <div css={{
                width: "100%",
                position: "absolute",
                bottom: 0,
                height: gradientHeight + paddingBottom,
                ...!expanded && {
                    background: "linear-gradient(transparent, "
                        + `${backgroundColor} ${gradientHeight}px, `
                        + `${backgroundColor} ${gradientHeight + paddingBottom}px)`,
                },
            }} />}

            {/* Button */}
            {showButton && <ProtoButton onClick={() => setExpanded(!expanded)} css={{
                position: "absolute",
                bottom: 0,
                left: "50%",
                transform: "translateX(-50%)",
                padding: "2px 8px",
                borderRadius: 4,
                ":hover": {
                    backgroundColor: buttonHoverBackgroundColor,
                },
                ...buttonCss,
            }}>{buttonLabel(expanded)}</ProtoButton>}
        </div>
    );
};
