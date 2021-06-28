import React, { useContext, useState } from "react";


type MenuState = "closed" | "burger";
class Menu {
    public readonly state: MenuState;
    private readonly setState: (state: MenuState) => void;

    public constructor(state: MenuState, setState: (state: MenuState) => void) {
        this.state = state;
        this.setState = setState;
    }

    public close() {
        this.setState("closed");
    }

    public toggleMenu(menu: Exclude<MenuState, "closed">) {
        this.setState(this.state === "closed" ? menu : "closed");
    }
}

const MenuContext = React.createContext<Menu>(new Menu("closed", () => {
    throw Error("damn");
}));
export const useMenu = (): Menu => useContext(MenuContext);

export const MenuProvider: React.FC = ({ children }) => {
    const [state, setState] = useState<MenuState>("closed");

    return (
        <MenuContext.Provider value={new Menu(state, setState)}>
            {children}
        </MenuContext.Provider>
    );
};
