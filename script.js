// Твої дані з Last.fm
const LASTFM_USER = 'Sanya1059'; 
const API_KEY = '50e49a7fecb6f701da3880ce4096c25a';
const RECENT_TRACK_LIMIT = 5;
const DEFAULT_COVER = 'https://via.placeholder.com/80?text=Music';

function getTrackImage(track) {
    const imageList = Array.isArray(track.image) ? track.image : [];
    const bestImage = imageList
        .map((img) => img?.['#text'])
        .filter(Boolean)
        .pop();

    return bestImage || DEFAULT_COVER;
}

function formatLastPlayed(track) {
    const isPlaying = track['@attr'] && track['@attr'].nowplaying === 'true';
    if (isPlaying) {
        return 'Зараз грає';
    }

    const uts = track.date?.uts;
    if (!uts) {
        return 'Час невідомий';
    }

    return new Intl.DateTimeFormat('uk-UA', {
        dateStyle: 'short',
        timeStyle: 'short'
    }).format(new Date(Number(uts) * 1000));
}

async function getUserPlaycount(trackName, artistName) {
    const params = new URLSearchParams({
        method: 'track.getInfo',
        user: LASTFM_USER,
        api_key: API_KEY,
        artist: artistName,
        track: trackName,
        autocorrect: '1',
        format: 'json'
    });

    try {
        const response = await fetch(`https://ws.audioscrobbler.com/2.0/?${params.toString()}`);
        const data = await response.json();
        return data.track?.userplaycount || '0';
    } catch {
        return '0';
    }
}

function normalizePlaycount(playcount) {
    const numeric = Number(playcount);
    if (!Number.isFinite(numeric) || numeric < 1) {
        return 1;
    }

    return Math.floor(numeric);
}

async function renderRecentTracks(tracks) {
    const recentSection = document.getElementById('recent-section');
    const recentTracksContainer = document.getElementById('recent-tracks');
    recentTracksContainer.innerHTML = '';

    const tracksWithPlaycount = await Promise.all(
        tracks.map(async (track) => {
            const artistName = track.artist?.['#text'] || 'Невідомий виконавець';
            const playcount = await getUserPlaycount(track.name, artistName);
            return { track, playcount };
        })
    );

    for (const item of tracksWithPlaycount) {
        const track = item.track;
        const artistName = track.artist?.['#text'] || 'Невідомий виконавець';

        const row = document.createElement('div');
        row.className = 'recent-track';

        const art = document.createElement('img');
        art.src = getTrackImage(track);
        art.alt = `${track.name} cover`;
        art.onerror = () => {
            art.src = DEFAULT_COVER;
        };

        const info = document.createElement('div');
        info.className = 'recent-track-info';

        const nameEl = document.createElement('p');
        nameEl.className = 'recent-track-name';
        nameEl.textContent = track.name;

        const artistEl = document.createElement('p');
        artistEl.className = 'recent-track-artist';
        artistEl.textContent = artistName;

        const metaEl = document.createElement('p');
        metaEl.className = 'recent-track-meta';
        metaEl.textContent = `Прослуховувань: ${normalizePlaycount(item.playcount)} • ${formatLastPlayed(track)}`;

        info.appendChild(nameEl);
        info.appendChild(artistEl);
        info.appendChild(metaEl);

        row.appendChild(art);
        row.appendChild(info);
        recentTracksContainer.appendChild(row);
    }

    recentSection.style.display = tracks.length ? 'block' : 'none';
}

async function updateMusic() {
    try {
        const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${LASTFM_USER}&api_key=${API_KEY}&format=json&limit=${RECENT_TRACK_LIMIT}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.recenttracks || !data.recenttracks.track[0]) return;
        
        const track = data.recenttracks.track[0];
        const isPlaying = track['@attr'] && track['@attr'].nowplaying === 'true';
        
        document.getElementById('track-name').innerText = track.name;
        document.getElementById('track-artist').innerText = track.artist['#text'];
        
        const imgUrl = getTrackImage(track);
        document.getElementById('track-art').src = imgUrl;
        document.getElementById('track-art').onerror = (event) => {
            event.currentTarget.src = DEFAULT_COVER;
        };
        
        document.getElementById('track-status').innerText = isPlaying ? "Зараз грає" : "Останній трек";
        document.getElementById('music-card').style.display = 'flex';

        await renderRecentTracks(data.recenttracks.track.slice(0, RECENT_TRACK_LIMIT));
        
    } catch (e) {
        console.error("Музика не завантажилась:", e);
    }
}

updateMusic();
setInterval(updateMusic, 30000);
