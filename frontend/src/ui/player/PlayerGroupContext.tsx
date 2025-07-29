import { Paella } from "paella-core";
import React, {
    createContext,
    useContext,
    PropsWithChildren,
    useRef,
} from "react";


type PlayerGroupContext = {
    players: Set<Paella>;
    activePlayer: React.MutableRefObject<Paella | null>;
    setActivePlayer: (player: Paella) => void;
    register: (player: Paella) => void;
    unregister: (player: Paella) => void;
}

const PlayerGroupContext = createContext<PlayerGroupContext>({
    players: new Set<Paella>(),
    activePlayer: { current: null },
    setActivePlayer: () => {},
    register: () => {},
    unregister: () => {},
});

export const PlayerGroupProvider: React.FC<PropsWithChildren> = ({ children }) => {
    const players = new Set<Paella>();
    const activePlayer = useRef<Paella | null>(null);

    const register = (player: Paella) => {
        players.add(player);
        if (!activePlayer.current) {
            activePlayer.current = player;
        }
    };

    const unregister = (player: Paella) => {
        players.delete(player);
        if (activePlayer.current === player) {
            activePlayer.current = players.size > 0 ? [...players][0] : null;
        }
    };

    const setActivePlayer = (player: Paella) => {
        activePlayer.current = player;
    };


    return <PlayerGroupContext.Provider value={{
        players,
        activePlayer,
        setActivePlayer,
        register,
        unregister,
    }}>
        {children}
    </PlayerGroupContext.Provider>;
};

export const usePlayerGroupContext = () => useContext(PlayerGroupContext);
