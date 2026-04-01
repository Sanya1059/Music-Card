// Твої дані з Last.fm
const LASTFM_USER = 'Sanya1059'; 
const API_KEY = '50e49a7fecb6f701da3880ce4096c25a';

async function updateMusic() {
    try {
        const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${LASTFM_USER}&api_key=${API_KEY}&format=json&limit=1`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.recenttracks || !data.recenttracks.track[0]) return;
        
        const track = data.recenttracks.track[0];
        const isPlaying = track['@attr'] && track['@attr'].nowplaying === 'true';
        
        document.getElementById('track-name').innerText = track.name;
        document.getElementById('track-artist').innerText = track.artist['#text'];
        
        const imgUrl = track.image[2]['#text'] || 'https://via.placeholder.com/50?text=Music';
        document.getElementById('track-art').src = imgUrl;
        
        document.getElementById('track-status').innerText = isPlaying ? "Зараз грає" : "Останній трек";
        document.getElementById('music-card').style.display = 'flex';
        
    } catch (e) {
        console.error("Музика не завантажилась:", e);
    }
}

updateMusic();
setInterval(updateMusic, 30000);
