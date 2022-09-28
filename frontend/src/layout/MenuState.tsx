import React, { ReactNode, useContext, useState } from "react";


type MenuState = "closed" | "burger" | "search";
type SetMenuState = React.Dispatch<React.SetStateAction<MenuState>>;
class Menu {
    public readonly state: MenuState;
    private readonly setState: SetMenuState;

    public constructor(state: MenuState, setState: SetMenuState) {
        this.state = state;
        this.setState = setState;
    }

    public close() {
        this.setState("closed");
    }

    public toggleMenu(menu: Exclude<MenuState, "closed">) {
        this.setState(state => state === "closed" ? menu : "closed");
    }
}

const MenuContext = React.createContext<Menu>(new Menu("closed", () => {
    throw Error("damn");
}));
export const useMenu = (): Menu => useContext(MenuContext);

export const MenuProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, setState] = useState<MenuState>("closed");

    return (
        <MenuContext.Provider value={new Menu(state, setState)}>
            {children}
        </MenuContext.Provider>
    );
};
