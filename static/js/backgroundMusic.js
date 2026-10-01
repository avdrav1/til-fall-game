let backgroundMusic;
let musicEnabled = false;
let musicVolume = 0.5; // Default volume

export function initializeBackgroundMusic() {
    backgroundMusic = document.getElementById('backgroundMusic');
    if (!backgroundMusic) {
        console.error('Background music element not found in the DOM');
        return;
    }
    backgroundMusic.loop = true; // Ensure the music loops
    setBackgroundMusicVolume(musicVolume);
    backgroundMusic.addEventListener('error', (e) => {
        console.error('Audio error:', e);
        musicEnabled = false;
    });
}

export function enableMusic() {
    if (!backgroundMusic) {
        console.error('Background music not initialized');
        return;
    }
    musicEnabled = true;
    if (!backgroundMusic.paused) return; // If it's already playing, do nothing
    backgroundMusic.play().catch(error => {
        console.error("Audio play failed:", error);
        musicEnabled = false;
    });
}

export function disableMusic() {
    if (!backgroundMusic) {
        console.error('Background music not initialized');
        return;
    }
    musicEnabled = false;
    backgroundMusic.pause();
}

export function toggleBackgroundMusic() {
    if (!backgroundMusic) {
        console.error('Background music not initialized');
        return;
    }
    if (!musicEnabled) {
        enableMusic();
    } else if (backgroundMusic.paused) {
        backgroundMusic.play().catch(error => {
            console.error("Audio play failed:", error);
            musicEnabled = false;
        });
    } else {
        backgroundMusic.pause();
    }
}

export function stopBackgroundMusic() {
    if (!backgroundMusic) {
        console.error('Background music not initialized');
        return;
    }
    backgroundMusic.pause();
    backgroundMusic.currentTime = 0;
}

export function setBackgroundMusicVolume(volume) {
    if (!backgroundMusic) {
        console.error('Background music not initialized');
        return;
    }
    musicVolume = Math.max(0, Math.min(1, volume));
    backgroundMusic.volume = musicVolume;
}

export function getBackgroundMusicVolume() {
    return musicVolume;
}

export function isMusicPlaying() {
    if (!backgroundMusic) {
        console.error('Background music not initialized');
        return false;
    }
    return !backgroundMusic.paused;
}

export function isMusicEnabled() {
    return musicEnabled;
}

export function fadeOutBackgroundMusic(duration = 1000) {
    if (!backgroundMusic || backgroundMusic.paused) return;
    
    const initialVolume = backgroundMusic.volume;
    const steps = 20;
    const volumeStep = initialVolume / steps;
    const intervalTime = duration / steps;

    const fadeInterval = setInterval(() => {
        if (backgroundMusic.volume > volumeStep) {
            backgroundMusic.volume -= volumeStep;
        } else {
            clearInterval(fadeInterval);
            stopBackgroundMusic();
            backgroundMusic.volume = initialVolume;
        }
    }, intervalTime);
}

export function fadeInBackgroundMusic(duration = 1000) {
    if (!backgroundMusic) return;
    
    const targetVolume = musicVolume;
    backgroundMusic.volume = 0;
    backgroundMusic.play().catch(error => {
        console.error("Audio play failed:", error);
        return;
    });

    const steps = 20;
    const volumeStep = targetVolume / steps;
    const intervalTime = duration / steps;

    const fadeInterval = setInterval(() => {
        if (backgroundMusic.volume < targetVolume - volumeStep) {
            backgroundMusic.volume += volumeStep;
        } else {
            clearInterval(fadeInterval);
            backgroundMusic.volume = targetVolume;
        }
    }, intervalTime);
}