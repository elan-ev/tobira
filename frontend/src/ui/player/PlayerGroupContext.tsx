import { Paella } from "paella-core";
import React, { createContext, useContext, PropsWithChildren } from "react";

type PlayerGroupContext = {
    players: Set<Paella> | null;
    register: (player: Paella) => void;
    unregister: (player: Paella) => void;
}

const PlayerGroupContext = createContext<PlayerGroupContext>({
    players: null,
    register: () => {},
    unregister: () => {},
});

export const PlayerGroupProvider: React.FC<PropsWithChildren> = ({ children }) => {
    const players = new Set<Paella>(null);

    const register = (player: Paella) => {
        players.add(player);
    };

    const unregister = (player: Paella) => {
        players.delete(player);
    };

    return (
        <PlayerGroupContext.Provider value={{ players, register, unregister }}>
            {children}
        </PlayerGroupContext.Provider>
    );
};

export const usePlayerGroupContext = () => useContext(PlayerGroupContext);
