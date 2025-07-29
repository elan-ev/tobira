import { Paella } from "paella-core";
import React, {
    createContext,
    useContext,
    PropsWithChildren,
    useRef,
} from "react";


type PlayerGroupContext = {
    players: React.MutableRefObject<Set<Paella>>;
    activePlayer: React.MutableRefObject<Paella | null>;
    setActivePlayer: (player: Paella) => void;
    register: (player: Paella) => void;
    unregister: (player: Paella) => void;
}

const PlayerGroupContext = createContext<PlayerGroupContext>({
    players: { current: new Set<Paella>() },
    activePlayer: { current: null },
    setActivePlayer: () => {},
    register: () => {},
    unregister: () => {},
});

export const PlayerGroupProvider: React.FC<PropsWithChildren> = ({ children }) => {
    const players = useRef(new Set<Paella>());
    const activePlayer = useRef<Paella | null>(null);

    const register = (player: Paella) => {
        players.current.add(player);
        if (!activePlayer.current) {
            activePlayer.current = player;
        }
    };

    const unregister = (player: Paella) => {
        players.current.delete(player);
        if (activePlayer.current === player) {
            activePlayer.current = players.current.size > 0 ? [...players.current][0] : null;
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
