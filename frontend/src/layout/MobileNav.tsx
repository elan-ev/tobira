import React from "react";
import { Nav } from "./NavMain";



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
                backgroundColor: "#F1F1F1",
                height: "100%",
                width: "clamp(260px, 75%, 450px)",
                overflowY: "auto",
            }}
        >
            <NavSection />
        </div>
    </div>
);

const NavSection: React.FC = () => {
    const items = [
        { id: "lectures", label: "Lectures", link: "/r/lectures", active: false },
        { id: "events", label: "Events", link: "/r/events", active: false },
        { id: "campus", label: "Campus", link: "/r/campus", active: false },
        { id: "conferences", label: "Conferences", link: "/r/conferences", active: false },
    ];

    return <Nav items={items} leafNode={false} />;
};
