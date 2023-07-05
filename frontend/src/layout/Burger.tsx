import { COLORS } from "../color";

type BurgerMenuProps = {
    hide: () => void;
    items: [] | readonly [JSX.Element] | readonly [JSX.Element, JSX.Element];
};

export const BurgerMenu: React.FC<BurgerMenuProps> = ({ hide, items }) => (
    <div
        onClick={e => {
            if (e.target === e.currentTarget) {
                hide();
            }
        }}
        css={{
            position: "absolute",
            top: "var(--header-height)",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 1000,
            backgroundColor: "#000000a0",
        }}
    >
        <div tabIndex={-1} css={{
            position: "absolute",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            top: 0,
            right: 0,
            backgroundColor: COLORS.neutral05,
            height: "100%",
            width: "clamp(260px, 75%, 450px)",
            overflowY: "auto",
            borderTop: `1px solid ${COLORS.neutral25}`,
            "> :nth-child(2)": { marginTop: 26 },
            li: {
                borderRadius: 4,
                margin: 8,
                borderBottom: "none",
                "a, span": {
                    padding: 16,
                    borderRadius: 4,
                },
            },
            nav: {
                "> a": {
                    margin: 8,
                    padding: "12px 4px",
                    borderRadius: 4,
                    "svg:first-of-type": {
                        display: "block",
                        fontSize: 24,
                    },
                    "svg:last-of-type": { display: "none" },
                },
                "> div": {
                    backgroundColor: COLORS.neutral20,
                    borderRadius: 4,
                    border: "none",
                    color: COLORS.primary2,
                    padding: 16,
                    margin: "0 8px",
                    "~ ul": { marginLeft: 26 },
                },
            },
        }}>
            {items.length > 0 && <div>{items[0]}</div>}
            {items.length > 1 && <>
                <div>{items[1]}</div>
            </>}
        </div>
    </div>
);
