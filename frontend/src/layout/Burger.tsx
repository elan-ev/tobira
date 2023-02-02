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
            backgroundColor: "white",
            height: "100%",
            width: "clamp(260px, 100vw, 450px)",
            overflowY: "auto",
            borderTop: "1px solid var(--grey80)",
            "& > *:nth-child(2)": {
                marginTop: 26,
            },
            "li": {
                borderRadius: 4,
                margin: 8,
                borderBottom: "none",
                "> a, > span": {
                    padding: 16,
                    borderRadius: 4,
                },
            },
            "& .return-button": {
                margin: "8px",
                padding: "12px 4px",
                borderRadius: 4,
                "> svg:nth-of-type(1)": {
                    display: "block",
                    fontSize: 24,
                },
                "svg:nth-of-type(2)": {
                    display: "none",
                },
            },
            "& .realm-name": {
                backgroundColor: "var(--grey86)",
                borderRadius: 4,
                border: "none",
                color: "var(--nav-color-darker)",
                padding: 16,
                paddingLeft: 16,
                margin: "0 8px",
            },
            "& .sub-realms > li": {
                marginLeft: 4 + 22 + 8,
            },
        }}>
            {items.length > 0 && <div>{items[0]}</div>}
            {items.length > 1 && <>
                <div>{items[1]}</div>
            </>}
        </div>
    </div>
);
