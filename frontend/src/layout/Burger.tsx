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
            zIndex: 3017,
            backgroundColor: "#000000a0",
        }}
    >
        <div css={{
            position: "absolute",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            top: 0,
            right: 0,
            backgroundColor: "var(--grey97)",
            height: "100%",
            width: "clamp(260px, 75%, 450px)",
            overflowY: "auto",
            borderTop: "1px solid var(--grey80)",
            gap: 16,
            "& > *:first-child": {
                borderBottom: "1px dashed var(--grey80)",
            },
            "& > *:last-child": {
                borderTop: "1px dashed var(--grey80)",
            },
        }}>
            {items.length > 0 && <div>{items[0]}</div>}
            {items.length > 1 && <>
                <div>{items[1]}</div>
            </>}
        </div>
    </div>
);
