import { ReactNode } from "react";


type BurgerMenuProps = {
    hide: () => void;
    children: ReactNode;
};

export const BurgerMenu: React.FC<BurgerMenuProps> = ({ hide, children }) => (
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
            zIndex: 100,
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
            "& > *:first-child": {
                borderBottom: "1px solid var(--grey80)",
            },
        }}>
            {children}
        </div>
    </div>
);
