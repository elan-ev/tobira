import React from "react";

export const Heading: React.FC = ({ children }) => <h3 css={{
    marginTop: 8,
    marginBottom: 4,
}}>
    {children}
</h3>;
