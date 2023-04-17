import { Interpolation } from "@emotion/react";
import {
    arrow,
    autoUpdate,
    flip,
    offset,
    Placement,
    safePolygon,
    shift,
    Side,
    useClick,
    useDismiss,
    useFloating,
    useFocus,
    useHover,
    useInteractions,
    useRole,
} from "@floating-ui/react";
import React, { ReactNode, ReactElement, useRef, useState, useImperativeHandle } from "react";
import { mergeRefs } from "react-merge-refs";
import { Theme } from "react-select";

import { bug, unreachable } from "../util/err";


// ===== The floating context ====================================================================
// This is used to communicate data between the container and the two child
// elements.

type Context = {
    open: boolean;
    setOpen: null | ((v: boolean) => void);
    settings: Required<Pick<
        FloatingContainerProps,
        "arrowSize" | "distance" | "borderRadius" | "viewPortMargin"
    >>;
    calculated: {
        placement: Placement;
        x: number | null;
        y: number | null;
        arrow?: {
            x?: number;
            y?: number;
        };
    };
    refs: Pick<ReturnType<typeof useFloating>, "reference" | "floating"> & {
        arrowRef: React.MutableRefObject<HTMLDivElement | null>;
    };
    getReferenceProps: ReturnType<typeof useInteractions>["getReferenceProps"];
    getFloatingProps: ReturnType<typeof useInteractions>["getFloatingProps"];
};

const FloatingContext = React.createContext<Context | null>(null);

const useFloatingContext = () => {
    const context = React.useContext(FloatingContext);

    if (context == null) {
        return bug("Missing <WithFloating> context");
    }

    return context;
};


// ===== <FloatingContainer> =====================================================================

export type FloatingHandle = HTMLDivElement & {
    close: () => void;
    open: () => void;
};

type FloatingContainerProps = React.PropsWithChildren<{
    /** Where to position the floating element relative to the reference element */
    placement: Placement;

    /** The size of the arrow tip. */
    arrowSize?: number;

    /** The distance between the arrow tip and the parent element. */
    distance?: number;

    /** Border radius of the floating element. */
    borderRadius?: number;

    /** Number of pixels the floating element should keep clear of the viewport edges. */
    viewPortMargin?: number;

    /**
     * ARIA role of the floating element. Default: `tooltip`. Change if
     * applicable! Note: if you use `menu` or `listbox`, the items of your
     * floating need an appropriate ARIA role as well!
     */
    ariaRole?: NonNullable<Parameters<typeof useRole>[1]>["role"];

    className?: string;
    // TODO: inline block?
} & (
    {
        /**
         * Which event on the reference element should trigger the floating
         * element to get visible. Alternatively, you can pass the `open` prop
         * to control this yourself.
         */
        trigger: "hover" | "click";
    }
    | {
        /**
         * Whether the floating element is opened/visible. Alternatively you can
         * pass the `trigger` prop to let this component handle the open
         * state.
         */
        open: boolean;
    }
)>;

/**
 * Provides a context for floating elements. Has to surround the floating
 * element and its reference.
 *
 * Some styles of the floating element need to be specified as props of this
 * container as they influence positioning.
 */
export const FloatingContainer = React.forwardRef<FloatingHandle, FloatingContainerProps>(
    ({
        children,
        placement: idealPlacement,
        arrowSize = 8,
        distance = 4,
        borderRadius = 4,
        viewPortMargin = 8,
        ariaRole = "tooltip",
        className,
        ...rest
    }, ref) => {
        const [open, setOpen] = useState(false);
        const actualOpen = "open" in rest ? rest.open : open;
        const arrowRef = useRef<HTMLDivElement>(null);
        const div = useRef<HTMLDivElement>(null);

        useImperativeHandle(ref, () => Object.assign(div.current ?? unreachable(), {
            open: () => setOpen(true),
            close: () => setOpen(false),
        }));

        // Setup positioning
        const {
            x,
            y,
            placement,
            reference,
            floating,
            middlewareData,
            context: floatContext,
        } = useFloating({
            open: actualOpen,
            ...!("open" in rest) && { onOpenChange: setOpen },
            placement: idealPlacement,
            whileElementsMounted: autoUpdate,
            middleware: [
                offset(arrowSize + distance),
                flip(),
                shift({ padding: viewPortMargin }),
                arrow({
                    element: arrowRef,
                    // In theory we have to multiply by √2 = 1.41... here, but we
                    // also want some extra padding so that the arrow doesn't touch
                    // the rounded corner directly. Factor 1.6 works well.
                    padding: borderRadius * 1.6,
                }),
            ],
        });


        // Setup interactions
        const hover = useHover(floatContext, {
            enabled: "trigger" in rest && rest.trigger === "hover",
            handleClose: safePolygon(),
            move: false,
        });
        const focus = useFocus(floatContext, {
            enabled: "trigger" in rest && rest.trigger === "hover",
        });
        const click = useClick(floatContext, {
            enabled: "trigger" in rest && rest.trigger === "click",
        });
        const dismiss = useDismiss(floatContext, {
            referencePress: ariaRole === "tooltip",
        });
        const role = useRole(floatContext, { role: ariaRole });
        const { getReferenceProps, getFloatingProps }
            = useInteractions([hover, focus, click, dismiss, role]);


        // Setup context
        const context: Context = {
            open: actualOpen,
            setOpen: ariaRole === "tooltip" ? setOpen : null,
            settings: { arrowSize, distance, borderRadius, viewPortMargin },
            calculated: { x, y, placement, arrow: middlewareData.arrow },
            refs: { reference, floating, arrowRef },
            getReferenceProps,
            getFloatingProps,
        };

        return (
            <FloatingContext.Provider value={context}>
                <div ref={div} css={{ position: "relative" }} {...{ className }}>
                    {children}
                </div>
            </FloatingContext.Provider>
        );
    },
);


// ===== <FloatingTrigger> ======================================================================

type FloatingTriggerProps = {
    children: ReactElement;
};

/**
 * Component to designate its single child element as "trigger" a floating
 * element, i.e. the reference element. Has to be placed inside a
 * `<FloatingContainer>`. The child of this component has to properly deal with
 * a `ref` prop (i.e. use `forwardRef` when using function components).
 */
export const FloatingTrigger: React.FC<FloatingTriggerProps> = ({ children }) => {
    const context = useFloatingContext();

    return React.cloneElement(children, {
        "data-floating-state": context.open ? "open" : "closed",
        ...context.getReferenceProps({
            ref: context.refs.reference,
            onClick: () => context.setOpen?.(false),
            ...children.props,
        }),
    });
};


// ===== <Floating> ==============================================================================

type FloatingProps = React.PropsWithChildren<{
    backgroundColor?: string;

    /** Border color. Default: `--grey65`. */
    borderColor?: string;

    borderWidth?: number;

    /**
     * Blur radius of the drop shadow. Too large numbers will look weird.
     * Avoiding that is hard or impossible.
     */
    shadowBlur?: number;

    /**
     * Color of drop shadow. Too strong of a shadow will look weird.
     * Avoiding that is hard or impossible.
     */
    shadowColor?: string;

    /** Padding of the content inside the floating div. */
    padding?: number | [number, number] | [number, number, number, number];

    /**
     * Extra styles applying to the content of this floating element. You
     * shouldn't try styling anything except the insides -- e.g. don't set
     * an "outline" or something like that.
     */
    className?: string;

    /**
     * Whether or not the arrow tip is hidden, which
     * might be useful for larger non-tooltip menus.
     * Default: false.
     */
    hideArrowTip?: boolean;

    // TODO: border width?
}>;

/**
 * A floating element (e.g. a tooltip or popover).
 *
 * Has to be placed inside a `<FloatingContainer>` together with a
 * `<FloatingTrigger>`.
 */
export const Floating = React.forwardRef<HTMLDivElement, FloatingProps>(
    ({
        children,
        backgroundColor = "white",
        borderColor = "var(--grey65)",
        borderWidth = 1,
        shadowColor = "rgba(0, 0, 0, 20%)",
        shadowBlur = 4,
        padding = [4, 8],
        className,
        hideArrowTip = false,
    }, ref) => {
        const { open, calculated, refs, settings, ...context } = useFloatingContext();

        // Render nothing if the floating element is not opened.
        if (!open) {
            return null;
        }

        const pos = sideOfPlacement(calculated.placement);
        const arrowSideLen = Math.SQRT2 * settings.arrowSize;

        const mergedRefs = mergeRefs([ref, refs.floating]);
        return (
            <div {...context.getFloatingProps({ ref: mergedRefs })} css={{
                "--floating-background-color": backgroundColor,
                "--floating-border-color": borderColor,
                "--floating-border-width": `${borderWidth}px`,
                "--floating-shadow-blur": `${shadowBlur}px`,
                "--floating-shadow-color": shadowColor,

                // Positioning
                position: "absolute",
                ...calculated.x != null && calculated.y != null
                    ? { left: calculated.x, top: calculated.y }
                    : { [invSide(pos)]: "100%" },
                width: "max-content",
                maxWidth: `calc(100vw - ${2 * settings.viewPortMargin}px)`,
                zIndex: 10000,

                // Styling
                backgroundColor: "var(--floating-background-color)",
                borderRadius: settings.borderRadius,
                boxShadow: "0 0 var(--floating-shadow-blur) var(--floating-shadow-color)",
                border: "var(--floating-border-width) solid var(--floating-border-color)",
            }}>
                {/* The content. We wrap it in another div to prevent overflow. */}
                <div {...{ className }} css={{
                    // TODO: sometimes you might want to not hide overflow
                    overflow: "hidden",
                    borderRadius: settings.borderRadius,
                    padding: (Array.isArray(padding) ? padding : [padding])
                        .map(n => `${n}px`)
                        .join(" "),
                }}>{children}</div>

                {/* The arrow tip. */}
                <div css={{
                    position: "absolute",
                    display: hideArrowTip ? "none" : "block",
                    ...pos === "top" || pos === "bottom"
                        ? {
                            left: 0,
                            right: 0,
                            height: settings.arrowSize + shadowBlur,
                        }
                        : {
                            top: 0,
                            bottom: 0,
                            width: settings.arrowSize + shadowBlur,
                        },
                    [pos]: "100%",
                    pointerEvents: "none",
                    overflow: "hidden",
                }}>
                    <div ref={refs.arrowRef} css={{
                        // Positioning
                        position: "absolute",
                        left: calculated.arrow?.x,
                        top: calculated.arrow?.y,
                        [pos]: -arrowSideLen / 2,
                        height: arrowSideLen,
                        width: arrowSideLen,
                        transform: "rotate(45deg)",

                        // Styling
                        backgroundColor: "var(--floating-background-color)",
                        boxShadow: `${shadowBlur / 6}px ${shadowBlur / 6}px `
                            + "var(--floating-shadow-blur) "
                            + `${shadowBlur / 12}px `
                            + "var(--floating-shadow-color)",
                        border: "var(--floating-border-width) solid var(--floating-border-color)",
                    }} />
                </div>
            </div>
        );
    },
);


// ===== Convenience Components ==================================================================

type WithTooltipProps = {
    children: ReactElement;
    tooltip: ReactNode;
    tooltipCss?: Interpolation<Theme>;
} & Partial<Omit<FloatingContainerProps, "trigger">>;

export const WithTooltip = React.forwardRef<FloatingHandle, WithTooltipProps>(
    ({ children, tooltip, tooltipCss, ...props }, ref) => (
        <FloatingContainer
            ref={ref}
            {...props}
            trigger="hover"
            placement={props.placement ?? "top"}
        >
            <Floating css={{
                color: "var(--grey20)",
                fontSize: 14,
                maxWidth: "100%",
                ...tooltipCss as Record<string, unknown>,
            }}>{tooltip}</Floating>
            <FloatingTrigger>{children}</FloatingTrigger>
        </FloatingContainer>
    ),
);


// ===== Utilities ===============================================================================

const invSide = (pos: Side): Side => {
    const map = {
        top: "bottom",
        right: "left",
        bottom: "top",
        left: "right",
    } as const;

    return map[pos];
};

const sideOfPlacement = (placement: Placement): Side => placement.split("-")[0] as Side;
