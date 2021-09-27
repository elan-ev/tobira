
export const Title: React.FC<{ title?: string }> = ({ title }) => (
    title === undefined ? null : <h2 css={{ margin: "16px 0" }}>{title}</h2>
);

export const Block: React.FC = ({ children }) => (
    <div css={{
        margin: "32px 0",
        ":first-of-type": {
            marginTop: 0,
        },
    }}>{children}</div>
);
