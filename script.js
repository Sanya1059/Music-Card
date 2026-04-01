// Твої дані з Last.fm
const LASTFM_USER = 'Sanya1059';
const API_KEY = '50e49a7fecb6f701da3880ce4096c25a';
const RECENT_TRACK_LIMIT = 5;
const API_FETCH_LIMIT = 120;
const FETCH_TIMEOUT_MS = 10000;

async function fetchJsonWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
    } finally {
        clearTimeout(timeoutId);
    }
}

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

function formatTime(ts) {
    return new Intl.DateTimeFormat('uk-UA', {
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date(ts * 1000));
}

function buildTrackPeriods(allTracks) {
    const periodMap = new Map();
    const nowTs = Math.floor(Date.now() / 1000);

    for (const track of allTracks) {
        const key = getTrackKey(track);
        if (!key) {
            continue;
        }

        const uts = track?.date?.uts;
        const ts = isNowPlaying(track) ? nowTs : Number(uts);
        if (!Number.isFinite(ts) || ts <= 0) {
            continue;
        }

        const existing = periodMap.get(key) || {
            startTs: ts,
            endTs: ts,
            isNow: false
        };

        existing.startTs = Math.min(existing.startTs, ts);
        existing.endTs = Math.max(existing.endTs, ts);
        if (isNowPlaying(track)) {
            existing.isNow = true;
            existing.endTs = nowTs;
        }

        periodMap.set(key, existing);
    }

    return periodMap;
}

function formatTrackPeriod(track, periodMap) {
    const period = periodMap.get(getTrackKey(track));
    if (!period) {
        return 'Період: невідомо';
    }

    const start = formatTime(period.startTs);
    const end = period.isNow ? 'зараз' : formatTime(period.endTs);

    if (start === end) {
        return `Період: ${start}`;
    }

    return `Період: ${start} - ${end}`;
}

function renderTrackingPanels(allTracks) {
    const status = document.getElementById('tracking-status');
    const hint = document.getElementById('tracking-hint');

    const todayTracks = allTracks.filter((track) => isTodayByUts(track?.date?.uts));

    if (todayTracks.length) {
        status.textContent = 'Скроблінг активний';
        hint.textContent = `Last.fm отримує треки (${todayTracks.length} за сьогодні), але не передає назву джерела або апки.`;
    } else {
        status.textContent = 'Немає свіжих скроблів';
        hint.textContent = 'Якщо в Last.fm трек уже з’явився, просто зачекай оновлення сайту. Джерело типу YouTube mod API не розкриває.';
    }
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

async function renderRecentTracks(tracks, periodMap) {
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

    for (const track of limited) {
        const row = document.createElement('div');
        row.className = 'recent-track';

        const info = document.createElement('div');
        info.className = 'recent-track-info';

        const nameEl = document.createElement('p');
        nameEl.className = 'recent-track-name';
        nameEl.textContent = track.name;

        const artistEl = document.createElement('p');
        artistEl.className = 'recent-track-artist';
        artistEl.textContent = getArtistName(track);

        const metaEl = document.createElement('p');
        metaEl.className = 'recent-track-meta';
        metaEl.textContent = `${formatTrackPeriod(track, periodMap)} • ${formatLastPlayed(track)}`;

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
    renderTrackingPanels([]);
}

async function updateMusic() {
    try {
        const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${LASTFM_USER}&api_key=${API_KEY}&format=json&limit=${API_FETCH_LIMIT}`;
        const data = await fetchJsonWithTimeout(url);

        if (data.error) {
            throw new Error(data.message || 'Last.fm API error');
        }

        const allTracks = asArray(data?.recenttracks?.track);
        const dedupedTracks = dedupeTracks(allTracks);
        const periodMap = buildTrackPeriods(allTracks);

        if (!dedupedTracks.length) {
            document.getElementById('track-name').innerText = 'Немає даних';
            document.getElementById('track-artist').innerText = 'Перевір Last.fm scrobbling';
            document.getElementById('track-status').innerText = 'Останній трек';
            document.getElementById('music-card').style.display = 'flex';
            await renderRecentTracks([], periodMap);
            renderLiveTimeline([]);
            renderTrackingPanels([]);
            return;
        }

        const currentTrack = dedupedTracks[0];
        document.getElementById('track-name').innerText = currentTrack.name;
        document.getElementById('track-artist').innerText = getArtistName(currentTrack);
        document.getElementById('track-status').innerText = isNowPlaying(currentTrack) ? 'Зараз грає' : 'Останній трек';
        document.getElementById('music-card').style.display = 'flex';

        await renderRecentTracks(dedupedTracks, periodMap);
        renderLiveTimeline(allTracks);
        renderTrackingPanels(allTracks);
    } catch (error) {
        console.error('Музика не завантажилась:', error);
        document.getElementById('track-name').innerText = 'Last.fm не відповів';
        document.getElementById('track-artist').innerText = 'Перевір мережу або онови сторінку';
        document.getElementById('track-status').innerText = 'Останній трек';
        document.getElementById('music-card').style.display = 'flex';
        await renderRecentTracks([], new Map());
        renderLiveTimeline([]);
        renderTrackingPanels([]);
    }
}

initMusicUI();
updateMusic();
setInterval(updateMusic, 30000);
