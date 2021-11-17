
export const Title: React.FC<{ title?: string }> = ({ title }) => (
    title === undefined ? null : <h2 css={{ margin: "16px 0" }}>{title}</h2>
);

export const Block: React.FC = ({ children }) => (
    <div>{children}</div>
);
