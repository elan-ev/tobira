/** Offered playback speeds. */
export const SPEEDS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2, 2.5];

/** The interval in seconds at which the player should skip forwards/backwards. */
export const SKIP_INTERVAL = 10;

/** Fixed framerate for single frame skips. */
export const FRAME_RATE = 25;

/** Duration of a single frame in seconds. */
export const FRAME_DURATION = 1 / FRAME_RATE;


export const TRANSLATIONS: Record<string, Record<string, string>> = {
    it: {
        // From paella-core
        "Put the videos side by side": "Posizionare i video uno accanto all'altro",
        "Minimize video": "Minimizza il video",
        "Close video": "Chiudi il video",
        "Place the video on the other side of the screen":
            "Posizionare il video sull'altro lato dello schermo",
        "Maximize video": "Ingrandisci il video",
        "Swap position of the videos": "Scambiare le posizioni dei video",
        "loadManifest(): Invalid current player state: $1":
            "loadManifest(): Stato di riproduzione attuale non valido: $1 ",
        "loadPlayer(): Invalid current player state: $1":
            "loadPlayer(): Stato di riproduzione attuale non valido: $1 ",
        "Could not load player: state transition in progress: $1":
            "Impossibile caricare il Player: transizione di stato in corso: $1",
        "Could not unload player: state transition in progress: $1":
            "Impossibile eliminare il Player: transizione di stato in corso: $1",
        "unloadManifest(): Invalid current player state: $1":
            "unloadManifest(): Stato del Player attualmente non valido: $1",
        "Error loading video manifest: $1 $2":
            "Errore durante il caricamento delle informazioni video: $1 $2",
        "Play/pause": "Riproduci/Pausa",
        "Select the active audio track": "Seleziona traccia audio attiva",
        "Toggle audio mute": "Attiva/disattiva audio",
        "Toggle play/pause": "Attiva/disattiva riproduzione",
        "Toggle captions": "Attiva/disattiva sottotitoli",
        "Backward $1 seconds": "Indietro di $1 secondi",
        "Forward $1 seconds": "Avanti di $1 secondi",
        "Volume up 10%": "Aumenta il volume del 10%",
        "Volume down 10%": "Diminuisci il volume del 10%",
        "Close pop-up": "Chiudi finestra pop-up",
        "Decrease playback speed": "Riduci la velocità di riproduzione",
        "Increase playback speed": "Aumenta la velocità di riproduzione",
        "Swap between side by side and minimized video":
            "Passaggio dalla visualizzazione affiancata alla visualizzazione ridotta del video",
        "Swap the position of the videos": "Cambio delle posizioni video",
        "Dual stream 50%": "Dual stream 50%",
        "Two videos 50%": "Due video 50%",
        "play": "Riproduci",
        "pause": "Pausa",

        // From paella-basic-plugins (some keys are specified in both, no need to do that here)
        "Captions": "Sottotitoli",
        "Search": "Cerca",
        "Search in captions": "Cerca nei sottotitoli",
        "No results found": "Nessun risultato trovato",
        "Toggle fullscreen": "Attiva/disattiva lo schermo intero",
        "Video layout": "Disposizione video",
        "Playback rate": "Velocità di riproduzione",
        "Video quality": "Qualità video",
        "Volume": "Volume",
        "Audio track": "Traccia audio",
        "Keyboard shortcuts": "Scorciatoie da tastiera",

        // Paella-zoom-plugin
        "Zoom in": "Ingrandisci",
        "Zoom out": "Rimpicciolisci",
        "Show video zoom options": "Mostra le opzioni di zoom",
        "Use Alt+Scroll to zoom": "Utilizzare Alt+Scorrimento per ingrandire",

        // Paella-slide-plugin
        "Show slides": "Mostra diapositive",
        "go to": "vai a",
        "Seek video to the next slide": "diapositiva successiva",
        "Seek video to the previous slide": "diapositiva precedente",
    },

    fr: {
        // Paella-core
        "Put the videos side by side": "Placer les vidéos côte à côte",
        "Minimize video": "Minimiser la vidéo",
        "Close video": "Fermer la vidéo",
        "Place the video on the other side of the screen":
            "Placer la vidéo de l'autre côté de l'écran",
        "Maximize video": "Maximiser la vidéo",
        "Swap position of the videos": "Échanger les positions des vidéos",
        "loadManifest(): Invalid current player state: $1":
            "loadManifest() : Statut de lecture actuel invalide : $1",
        "loadPlayer(): Invalid current player state: $1":
            "loadPlayer() : Statut de lecture actuel invalide : $1",
        "Could not load player: state transition in progress: $1":
            "Impossible de charger le lecteur : transition d’état en cours : $1",
        "Could not unload player: state transition in progress: $1":
            "Impossible de supprimer le lecteur : transition d’état en cours : $1",
        "unloadManifest(): Invalid current player state: $1":
            "unloadManifest() : Statut de lecteur actuellement invalide : $1",
        "Error loading video manifest: $1 $2":
            "Erreur lors du chargement des informations vidéo : $1 $2",
        "Play/pause": "Lecture/Pause",
        "Select the active audio track": "Sélectionner la piste audio active",
        "Toggle audio mute": "Activer/désactiver le mode muet",
        "Toggle play/pause": "Basculer Lecture/Pause",
        "Toggle captions": "Activer/désactiver les sous-titres",
        "Backward $1 seconds": "Reculer de $1 secondes",
        "Forward $1 seconds": "Avancer de $1 secondes",
        "Volume up 10%": "Augmenter le volume de 10 %",
        "Volume down 10%": "Diminuer le volume de 10 %",
        "Close pop-up": "Fermer la fenêtre contextuelle",
        "Decrease playback speed": "Réduire la vitesse de lecture",
        "Increase playback speed": "Augmenter la vitesse de lecture",
        "Swap between side by side and minimized video":
            "Basculer entre vidéos côte à côte et vidéo minimisée",
        "Swap the position of the videos": "Échanger les positions des vidéos",
        "Dual stream 50%": "Dual stream 50%",
        "Two videos 50%": "Deux vidéos 50%",
        "play": "Lecture",
        "pause": "Pause",

        // Paella-basic-plugins
        "Captions": "Sous-titres",
        "Search": "Rechercher",
        "Search in captions": "rechercher dans les sous-titres",
        "No results found": "Pas de résultats",
        "Toggle fullscreen": "Activer/désactiver en plein écran",
        "Video layout": "Mise en page vidéo",
        "Playback rate": "Vitesse de lecture",
        "Video quality": "Qualité vidéo",
        "Volume": "Volume",
        "Audio track": "Trace audio",
        "Keyboard shortcuts": "Raccourcis clavier",

        // Paella-zoom-plugin
        "Zoom in": "Zoomer",
        "Zoom out": "Zoom arrière",
        "Show video zoom options": "Afficher l'option de zoom vidéon",
        "Use Alt+Scroll to zoom": "Utilisez Alt+Défilement pour zoomer",

        // Paella-slide-plugin
        "Show slides": "Afficher les diapositives",
        "go to": "aller à",
        "Seek video to the next slide": "diapositive prochaine",
        "Seek video to the previous slide": "diapositive précédente",
    },
};
