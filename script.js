// Твої дані з Last.fm
const LASTFM_USER = 'Sanya1059';
const API_KEY = '50e49a7fecb6f701da3880ce4096c25a';
const RECENT_TRACK_LIMIT = 5;
const API_FETCH_LIMIT = 120;
const SOURCE_COUNT_KEY = 'tracking_source_count';

const playcountCache = new Map();
const nowPlayingIncrementGuard = new Set();

function asArray(value) {
    if (!value) {
        return [];
    }

    return Array.isArray(value) ? value : [value];
}

function getArtistName(track) {
    return track?.artist?.['#text'] || 'Невідомий виконавець';
}

function isNowPlaying(track) {
    return track?.['@attr']?.nowplaying === 'true';
}

function getTrackKey(track) {
    return `${String(track?.name || '').trim().toLowerCase()}::${String(getArtistName(track)).trim().toLowerCase()}`;
}

function dedupeTracks(tracks) {
    const unique = [];
    const seen = new Set();

    for (const track of tracks) {
        const key = getTrackKey(track);
        if (!key || seen.has(key)) {
            continue;
        }

        seen.add(key);
        unique.push(track);
    }

    return unique;
}

function isTodayByUts(uts) {
    if (!uts) {
        return false;
    }

    const date = new Date(Number(uts) * 1000);
    const now = new Date();

    return date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate();
}

function formatLastPlayed(track) {
    if (isNowPlaying(track)) {
        return 'Зараз грає';
    }

    const uts = track?.date?.uts;
    if (!uts) {
        return 'Час невідомий';
    }

    return new Intl.DateTimeFormat('uk-UA', {
        dateStyle: 'short',
        timeStyle: 'short'
    }).format(new Date(Number(uts) * 1000));
}

async function getUserPlaycount(trackName, artistName) {
    const cacheKey = `${trackName}::${artistName}`.toLowerCase();
    if (playcountCache.has(cacheKey)) {
        return playcountCache.get(cacheKey);
    }

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
        const normalized = normalizePlaycount(data?.track?.userplaycount || '0');
        playcountCache.set(cacheKey, normalized);
        return normalized;
    } catch {
        return 1;
    }
}

function normalizePlaycount(playcount) {
    const numeric = Number(playcount);
    if (!Number.isFinite(numeric) || numeric < 1) {
        return 1;
    }

    return Math.floor(numeric);
}

function getDisplayPlaycount(track, basePlaycount) {
    const key = getTrackKey(track);
    const normalized = normalizePlaycount(basePlaycount);

    if (!isNowPlaying(track)) {
        return normalized;
    }

    if (nowPlayingIncrementGuard.has(key)) {
        return normalized;
    }

    nowPlayingIncrementGuard.add(key);
    return normalized + 1;
}

function renderLiveTimeline(allTracks) {
    const timeline = document.getElementById('live-timeline');
    const summary = document.getElementById('live-summary');
    timeline.innerHTML = '';

    const bins = new Array(24).fill(0);
    let todayCount = 0;

    for (const track of allTracks) {
        const uts = track?.date?.uts;
        if (!isTodayByUts(uts)) {
            continue;
        }

        const date = new Date(Number(uts) * 1000);
        bins[date.getHours()] += 1;
        todayCount += 1;
    }

    if (isNowPlaying(allTracks[0])) {
        bins[new Date().getHours()] += 1;
        todayCount += 1;
    }

    const max = Math.max(...bins, 1);

    for (let hour = 0; hour < 24; hour += 1) {
        const bar = document.createElement('div');
        bar.className = 'live-bar';
        bar.style.height = `${Math.max(6, Math.round((bins[hour] / max) * 44))}px`;
        bar.title = `${String(hour).padStart(2, '0')}:00 - ${bins[hour]} трек(ів)`;
        timeline.appendChild(bar);
    }

    summary.textContent = todayCount
        ? `Сьогодні зафіксовано ${todayCount} прослуховувань`
        : 'Сьогодні ще немає прослуховувань';
}

function getTrackingSourceCount() {
    const raw = Number(localStorage.getItem(SOURCE_COUNT_KEY));
    if (!Number.isFinite(raw) || raw < 1) {
        return 1;
    }

    return Math.floor(raw);
}

function setTrackingSourceCount(count) {
    const normalized = Math.max(1, Math.floor(count));
    localStorage.setItem(SOURCE_COUNT_KEY, String(normalized));
    renderTrackingPanels();
}

function renderTrackingPanels() {
    const count = getTrackingSourceCount();
    const status = document.getElementById('tracking-status');
    const hint = document.getElementById('tracking-hint');
    const extraWindow = document.getElementById('extra-source-window');
    const extraText = document.getElementById('extra-source-text');

    status.textContent = count === 1
        ? '1 джерело (базове)'
        : `${count} джерела активні`;

    hint.textContent = count === 1
        ? 'Натисни +1, якщо в Pano Scrobbler додав ще одне відстеження.'
        : `Додаткових джерел: ${count - 1}. Вікно нижче з\'являється автоматично.`;

    if (count > 1) {
        extraWindow.style.display = 'block';
        extraText.textContent = `Працює розширений режим: +${count - 1} додаткове(их) джерело(а).`;
    } else {
        extraWindow.style.display = 'none';
    }
}

function attachTrackingControls() {
    const incButton = document.getElementById('source-inc');
    const decButton = document.getElementById('source-dec');

    incButton.addEventListener('click', () => {
        setTrackingSourceCount(getTrackingSourceCount() + 1);
    });

    decButton.addEventListener('click', () => {
        setTrackingSourceCount(getTrackingSourceCount() - 1);
    });
}

async function renderRecentTracks(tracks) {
    const recentTracksContainer = document.getElementById('recent-tracks');
    recentTracksContainer.innerHTML = '';

    if (!tracks.length) {
        const emptyState = document.createElement('p');
        emptyState.className = 'recent-empty';
        emptyState.textContent = 'Немає нещодавніх прослуховувань';
        recentTracksContainer.appendChild(emptyState);
        return;
    }

    const limited = dedupeTracks(tracks).slice(0, RECENT_TRACK_LIMIT);
    const tracksWithPlaycount = await Promise.all(
        limited.map(async (track) => {
            const artistName = getArtistName(track);
            const basePlaycount = await getUserPlaycount(track.name, artistName);
            return { track, artistName, basePlaycount };
        })
    );

    for (const item of tracksWithPlaycount) {
        const row = document.createElement('div');
        row.className = 'recent-track';

        const info = document.createElement('div');
        info.className = 'recent-track-info';

        const nameEl = document.createElement('p');
        nameEl.className = 'recent-track-name';
        nameEl.textContent = item.track.name;

        const artistEl = document.createElement('p');
        artistEl.className = 'recent-track-artist';
        artistEl.textContent = item.artistName;

        const metaEl = document.createElement('p');
        metaEl.className = 'recent-track-meta';
        metaEl.textContent = `Прослуховувань: ${getDisplayPlaycount(item.track, item.basePlaycount)} • ${formatLastPlayed(item.track)}`;

        info.appendChild(nameEl);
        info.appendChild(artistEl);
        info.appendChild(metaEl);
        row.appendChild(info);
        recentTracksContainer.appendChild(row);
    }
}

function initMusicUI() {
    document.getElementById('track-name').innerText = 'Завантаження...';
    document.getElementById('track-artist').innerText = 'Чекаємо відповідь Last.fm';
    document.getElementById('track-status').innerText = 'Останній трек';
    document.getElementById('music-card').style.display = 'flex';
    document.getElementById('recent-tracks').innerHTML = '<p class="recent-empty">Немає нещодавніх прослуховувань</p>';
    document.getElementById('live-summary').textContent = 'Немає активності за сьогодні';
    renderTrackingPanels();
}

async function updateMusic() {
    try {
        const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${LASTFM_USER}&api_key=${API_KEY}&format=json&limit=${API_FETCH_LIMIT}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            throw new Error(data.message || 'Last.fm API error');
        }

        const allTracks = asArray(data?.recenttracks?.track);
        const dedupedTracks = dedupeTracks(allTracks);
        if (!dedupedTracks.length) {
            document.getElementById('track-name').innerText = 'Немає даних';
            document.getElementById('track-artist').innerText = 'Перевір Last.fm scrobbling';
            document.getElementById('track-status').innerText = 'Останній трек';
            document.getElementById('music-card').style.display = 'flex';
            await renderRecentTracks([]);
            renderLiveTimeline([]);
            renderYoutubePanel(0);
            return;
        }

        const currentTrack = dedupedTracks[0];
        document.getElementById('track-name').innerText = currentTrack.name;
        document.getElementById('track-artist').innerText = getArtistName(currentTrack);
        document.getElementById('track-status').innerText = isNowPlaying(currentTrack) ? 'Зараз грає' : 'Останній трек';
        document.getElementById('music-card').style.display = 'flex';

        await renderRecentTracks(dedupedTracks);
        renderLiveTimeline(allTracks);
    } catch (error) {
        console.error('Музика не завантажилась:', error);
        document.getElementById('track-name').innerText = 'Помилка завантаження';
        document.getElementById('track-artist').innerText = 'Перевір API ключ і Last.fm';
        document.getElementById('track-status').innerText = 'Останній трек';
        document.getElementById('music-card').style.display = 'flex';
        await renderRecentTracks([]);
        renderLiveTimeline([]);
        renderTrackingPanels();
    }
}

    attachTrackingControls();
initMusicUI();
updateMusic();
setInterval(updateMusic, 30000);
