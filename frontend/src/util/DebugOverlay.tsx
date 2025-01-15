import { COLORS } from "../color";


export type QueryInfo = {
    /** In ms */
    duration: number;
    numQueries: number;
};

export const queryInfos: QueryInfo[] = [];

export const DebugOverlay: React.FC = () => (
    <div css={{
        position: "fixed",
        bottom: 0,
        left: 2,
        zIndex: 1000,
        background: COLORS.neutral05,
    }}>
        <div css={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(var(--color-neutral05), transparent 60%)",
            zIndex: 500,
        }} />
        {queryInfos.map((info, i) => (
            <div key={i} css={{
                position: "relative",
                margin: "3px 0",
                hr: {
                    margin: 0,
                },
                div: {
                    position: "absolute",
                    left: "100%",
                    bottom: -3,
                    width: 150,
                    paddingLeft: 8,
                    fontSize: 12,
                    background: COLORS.neutral05,
                    display: "none",
                },
                "&:hover > div": {
                    display: "initial",
                },
            }}>
                <hr css={{
                    width: info.duration * 4,
                    border: "none",
                    borderTop: "3px solid #df3a3a",
                }} />

                {/* Show one dot per query, with each dot being 3x3 px and 3px spacing */}
                <hr css={{
                    width: info.numQueries * 6 - 3,
                    height: 3,
                    border: "none",
                    backgroundImage:
                        "linear-gradient(to right, yellow 50%, rgba(255,255,255,0) 0%)",
                    backgroundPosition: "left",
                    backgroundSize: "6px 3px",
                    backgroundRepeat: "repeat-x",
                }} />

                <div>{info.duration}ms, {info.numQueries} queries</div>
            </div>
        ))}
    </div>
);
