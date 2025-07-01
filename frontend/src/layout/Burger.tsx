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
                "a, span, button": {
                    borderRadius: 4,
                },
            },
            "div > ul > li": {
                "a, span, button": {
                    padding: 16,
                },
            },
            "div > nav > ul > li": {
                "> a, > div, > button": {
                    paddingTop: 16,
                    paddingBottom: 16,
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
