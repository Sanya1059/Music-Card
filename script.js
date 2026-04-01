// Твої дані з Last.fm
const LASTFM_USER = 'Sanya1059';
const API_KEY = '50e49a7fecb6f701da3880ce4096c25a';
const RECENT_TRACK_LIMIT = 5;
const API_FETCH_LIMIT = 120;

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

function inferExtraSourceState(allTracks) {
    const todayTracks = allTracks.filter((track) => isTodayByUts(track?.date?.uts));
    const todayUnique = dedupeTracks(todayTracks).length;

    const timestamps = todayTracks
        .map((track) => Number(track?.date?.uts))
        .filter((ts) => Number.isFinite(ts) && ts > 0)
        .sort((a, b) => b - a);

    let shortGaps = 0;
    for (let i = 0; i < timestamps.length - 1; i += 1) {
        if (timestamps[i] - timestamps[i + 1] <= 180) {
            shortGaps += 1;
        }
    }

    const probableExtra = todayTracks.length >= 12 || (todayUnique >= 7 && shortGaps >= 3);

    if (probableExtra) {
        return {
            active: true,
            status: 'Ймовірно є додаткове джерело',
            hint: `Сьогодні ${todayTracks.length} скроблів і щільний патерн. Схоже, в Pano увімкнено ще одне відстеження.`
        };
    }

    return {
        active: false,
        status: 'Базове джерело',
        hint: `Сьогодні ${todayTracks.length} скроблів. Ознак додаткового джерела не виявлено.`
    };
}

function renderTrackingPanels(allTracks) {
    const status = document.getElementById('tracking-status');
    const hint = document.getElementById('tracking-hint');
    const extraWindow = document.getElementById('extra-source-window');
    const extraText = document.getElementById('extra-source-text');

    const state = inferExtraSourceState(allTracks);
    status.textContent = state.status;
    hint.textContent = state.hint;

    if (state.active) {
        extraWindow.style.display = 'block';
        extraText.textContent = 'Автоматично виявлено ознаки додаткового джерела відстеження.';
    } else {
        extraWindow.style.display = 'none';
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
        const response = await fetch(url);
        const data = await response.json();

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
        document.getElementById('track-name').innerText = 'Помилка завантаження';
        document.getElementById('track-artist').innerText = 'Перевір API ключ і Last.fm';
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
