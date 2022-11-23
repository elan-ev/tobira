import { forwardRef } from "react";

type PopOverProps = React.PropsWithChildren<{
    /**
     * Whether the popover is visible.
     *
     * - If you want to show the popover based on a CSS state (e.g. hover):
     *   leave this unset and add this to the CSS of the parent element:
     *   `"&:not(:hover) > div[data-popover-marker]": { display: "none" }`.
     *
     * - If you want to show the popover triggered by a JS event (e.g. click):
     *   manage the visible state in your component via `useState` for example
     *   and set this attribute accordingly.
     */
    visible?: boolean;

    /** Should the popover appear above or below the parent element? */
    pos: "top" | "bottom";

    /**
     * The horizontal anchor. The popover will grow in the opposite direction
     * with more content. Default: left.
     */
    anchor?: "left" | "right";

    /** Distance between the popover and the anchor point. */
    anchorDist?: number;

    /**
     * This plus `anchorDist` + `borderRadius` is the distance between the
     * anchor and the arrow.
     */
    arrowDist?: number;

    /** The size (side length) of the arrow tip. */
    arrowSize?: number;

    /* The distance between the arrow tip and the parent element. */
    distance?: number;

    /** Background color. Default: white. */
    backgroundColor?: string;

    /** Border color. Default: `--grey65`. */
    borderColor?: string;

    /** Border radius. */
    borderRadius?: number;

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

    /**
     * Padding of the content div. Either single number or two for vertical and
     * horizontal padding.
     */
    padding?: number | [number, number] | [number, number, number, number];
}>;

/**
 * A popover element with an arrow tip. Parent element must be `position: relative`!
 */
export const PopOver = forwardRef<HTMLDivElement, PopOverProps>((
    {
        pos,
        visible,
        anchor = "left",
        anchorDist = 4,
        arrowDist = 4,
        arrowSize = 8,
        distance = 4,
        backgroundColor = "white",
        borderColor = "var(--grey65)",
        borderRadius = 4,
        shadowBlur = 5,
        shadowColor = "rgba(0, 0, 0, 20%)",
        padding = [4, 8],
        children,
    },
    ref,
) => {
    const invPos = pos === "top" ? "bottom" : "top";

    const boxShadow = `0 0 ${shadowBlur}px ${shadowColor}`;

    // We use four different nodes (three divs, one pseudo one via `:after`) for
    // this. This comment refers to them as A, B, C, and D with A being the
    // outermost, and D being the innermost (the `:after` one). The parent of
    // this whole tooltip is called P.
    //
    // The actual tooltip contents lives in B. The visible array tip/triangle is
    // D -- simply a div rotated by 45°. The purpose of C is to cut out half of
    // D (so that only a triangle is shown) via `overflow: none`. A second
    // purpose of C and the purpose of A is to provide an invisible area
    // between P and the tooltip itself. If there was nothing in between and
    // the tooltip is only shown on `:hover`, then the user could never reach
    // the tooltip contents with mouse. And that would be quite annoying. C has
    // the width of the tooltip, A has the width of P.

    return (
        <div data-popover-marker ref={ref} css={{
            // Set some CSS variables for all CSS code below. This is useful as
            // it allows to change some basic parameters in the browser's dev
            // tools directly.
            "--arrow-height": `${arrowSize}px`,
            "--arrow-side-length": `calc(var(--arrow-height) * ${Math.sqrt(2)})`,
            "--distance": `${distance}px`,
            "--background-color": backgroundColor,
            "--border-color": borderColor,
            "--border-radius": `${borderRadius}px`,
            "--anchor-dist": `${anchorDist}px`,
            "--arrow-dist": `${arrowDist}px`,

            // Visibility
            ...visible === undefined ? {} : { display: visible ? "initial" : "none" },

            // Positioning
            position: "absolute",
            zIndex: 10000,
            left: 0,
            right: 0,
            [invPos]: "100%",
            height: "calc(var(--border-radius) + var(--arrow-height) + var(--distance))",
        }}>
            <div css={{
                position: "absolute",
                [invPos]: "calc(var(--arrow-height) + var(--distance))",
                [anchor]: "var(--anchor-dist)",
                width: "max-content",

                // Styling
                backgroundColor: "var(--background-color)",
                borderRadius: "var(--border-radius)",
                border: "1px solid var(--border-color)",
                boxShadow,
                padding: (Array.isArray(padding) ? padding : [padding])
                    .map(n => `${n}px`)
                    .join(" "),
            }} >
                {/* This is the arrow tip. The div is just a box used to clip the
                    `:after` element below via `overflow: hidden`. */}
                <div css={{
                    position: "absolute",
                    "--my-height": `calc(var(--arrow-height) + ${shadowBlur}px + var(--distance))`,
                    [invPos]: "calc(-1 * var(--my-height))",
                    [anchor]: 0,
                    height: "var(--my-height)",
                    width: "100%",
                    overflow: "hidden",

                    // This is the actual visible arrow. A div rotated by 45°.
                    "&:after": {
                        content: "''",
                        position: "absolute",
                        [anchor]: "calc(var(--border-radius) + var(--arrow-dist) \
                            + var(--arrow-height) - var(--arrow-side-length) / 2)",
                        [pos]: "calc(-1 * var(--arrow-side-length) / 2)",
                        width: "var(--arrow-side-length)",
                        height: "var(--arrow-side-length)",
                        transform: "rotate(45deg)",

                        // Styling
                        backgroundColor: "var(--background-color)",
                        border: "1px solid var(--border-color)",
                        boxShadow,
                    },
                }} />

                {/* Extra div to prevent overflow from children. */}
                <div css={{ borderRadius: "var(--border-radius)", overflow: "hidden" }}>
                    {children}
                </div>
            </div>
        </div>
    );
});
