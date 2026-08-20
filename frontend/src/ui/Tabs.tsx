import React, { useContext } from "react";
import { COLORS } from "../color";
import { bug, ProtoButton } from "@opencast/appkit";
import { css } from "@emotion/react";


type TabsProps = React.PropsWithChildren<{
    active: string,
}>;

/** Tab UI. State is externally managed. */
export const Tabs: React.FC<TabsProps> = ({ active, children }) => (
    <Context.Provider value={{ active }}>
        <div css={{
            width: "100%",
            marginBottom: 32,
            borderBottom: `2px solid ${COLORS.neutral20}`,
        }}>
            {children}
        </div>
    </Context.Provider>
);

const tabCss = css({
    padding: "12px 24px",
    fontWeight: "bold",
    color: COLORS.neutral80,
    ":hover": {
        color: COLORS.neutral90,
    },
    ':is([aria-selected="true"])': {
        color: COLORS.primary0,
        position: "relative",
        "::before": {
            content: "''",
            position: "absolute",
            bottom: -2,
            height: 2,
            insetInline: 0,
            backgroundColor: COLORS.primary0,
        },
    },
});

const Context = React.createContext<Context | null>(null);
type Context = {
    active: string,
};

type TabProps<N extends string> = React.PropsWithChildren<{
    name: N,
    onClick: (name: N) => void;
}>;

export const Tab = <N extends string>({ name, onClick, children }: TabProps<N>) => {
    const context = useContext(Context) ?? bug("used <Tab> outside of <Tabs>");

    return (
        <ProtoButton
            onClick={() => onClick(name)}
            {...context.active === name && { "aria-selected": true, disabled: true }}
            css={tabCss}
        >
            {children}
        </ProtoButton>
    );
};
