import { FiX } from "react-icons/fi";

type Props = {
    title: string;
    close: () => void;
};


export const Modal: React.FC<Props> = ({ title, close, children }) => (
    <div
        onClick={e => {
            if (e.target === e.currentTarget) {
                close();
            }
        }}
        css={{
            position: "fixed",
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
        }}
    >
        <div css={{
            backgroundColor: "white",
            borderRadius: 4,
            width: 400,
            maxWidth: "100%",
            margin: 16,
        }}>
            <div css={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--grey80)",
                display: "flex",
                alignItems: "center",
            }}>
                <h2 css={{ flex: "1" }}>{title}</h2>
                <div
                    onClick={close}
                    css={{ fontSize: 32, cursor: "pointer", display: "inline-flex" }}
                ><FiX /></div>
            </div>
            <div css={{ padding: 16 }}>{children}</div>
        </div>
    </div>
);
