import React from "react";



type Props = {
    /** Function that hides the burger menu. */
    hide: () => void;
};

export const MobileNav: React.FC<Props> = ({ hide }) => (
    <div
        onClick={hide}
        css={{
            position: "absolute",
            top: "var(--header-height)",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            backgroundColor: "#000000a0",
        }}
    >
        <div
            onClick={e => e.stopPropagation()}
            css={{
                position: "absolute",
                top: 0,
                right: 0,
                backgroundColor: "green",
                minHeight: "calc(100vh - var(--header-height))",
                width: "clamp(220px, 70%, 500px)",
            }}
        ></div>
    </div>
);
