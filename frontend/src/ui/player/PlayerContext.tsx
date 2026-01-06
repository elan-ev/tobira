import {
    Dispatch,
    PropsWithChildren,
    RefObject,
    SetStateAction,
    createContext,
    useContext,
    useRef,
    useState,
} from "react";
import { PaellaState } from "./Paella";
import { bug } from "@opencast/appkit";

type PlayerContext = {
    paella: RefObject<PaellaState | null>;
    playerIsLoaded: boolean;
    setPlayerIsLoaded: Dispatch<SetStateAction<boolean>>;
};

const PlayerContext = createContext<PlayerContext | null>(null);

export const PlayerContextProvider: React.FC<PropsWithChildren> = ({ children }) => {
    const paella = useRef<PaellaState>(null);
    const [playerIsLoaded, setPlayerIsLoaded] = useState(false);

    return <PlayerContext.Provider value={{ paella, playerIsLoaded, setPlayerIsLoaded }}>
        {children}
    </PlayerContext.Provider>;
};

export const usePlayerContext = () => useContext(PlayerContext)
    ?? bug("Player context is not initialized!");
