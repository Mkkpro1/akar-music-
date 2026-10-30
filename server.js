import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Ytdl, chooseFormat } from '@distube/ytdl-core';
import ytSearch from 'yt-search';

// GitHub update kontrol gecikmesini devre dışı bırak
process.env.YTDL_NO_UPDATE = '1';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Bulut barındırma (Render / Railway) ve harici istemciler için tam CORS yapılandırması
const corsOptions = {
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Range', 'Authorization'],
    exposedHeaders: ['Content-Disposition', 'Content-Range', 'Content-Length', 'Accept-Ranges']
};

app.use(cors(corsOptions));
app.use(express.json());

// Statik Dosyaları Sun
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// Socket.io Gerçek Zamanlı Motoru
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3000;
const ytdl = new Ytdl();

// =========================================================================
// HIZ VE PERFORMANS ÖNBELLEK (CACHE) MEKANİZMASI
// =========================================================================
const searchCache = new Map();
const SEARCH_CACHE_TTL = 10 * 60 * 1000; // 10 Dakika

function getCachedSearch(key) {
    const entry = searchCache.get(key.toLowerCase().trim());
    if (entry && (Date.now() - entry.time < SEARCH_CACHE_TTL)) {
        return entry.data;
    }
    return null;
}

function setCachedSearch(key, data) {
    if (searchCache.size > 300) {
        // En eski anahtarı sil
        searchCache.delete(searchCache.keys().next().value);
    }
    searchCache.set(key.toLowerCase().trim(), { data, time: Date.now() });
}

// Şarkı Video Detayları Önbelleği (Time-to-First-Byte'ı sıfıra indirmek için)
const infoCache = new Map();
const INFO_CACHE_TTL = 20 * 60 * 1000; // 20 Dakika

async function getCachedInfo(targetUrl) {
    const cached = infoCache.get(targetUrl);
    if (cached && (Date.now() - cached.time < INFO_CACHE_TTL)) {
        return cached.info;
    }
    const info = await ytdl.getInfo(targetUrl);
    if (infoCache.size > 200) {
        infoCache.delete(infoCache.keys().next().value);
    }
    infoCache.set(targetUrl, { info, time: Date.now() });
    return info;
}

// Yardımcı Fonksiyonlar
function formatViews(views) {
    if (!views || isNaN(views)) return '1.2M izlenme';
    const num = Number(views);
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace('.0', '') + 'M izlenme';
    if (num >= 1_000) return (num / 1_000).toFixed(1).replace('.0', '') + 'B izlenme';
    return num + ' izlenme';
}

function resolveYouTubeUrl(input) {
    if (!input || typeof input !== 'string') return null;
    const trimmed = input.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return `https://www.youtube.com/watch?v=${trimmed}`;
    if (trimmed.includes('youtube.com/watch?v=') || trimmed.includes('youtu.be/') || trimmed.includes('youtube.com/shorts/')) return trimmed;
    return null;
}

function sanitizeFilename(title) {
    if (!title) return 'muzik';
    return title.replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'muzik';
}

// Hazır Trend Önbelleği
const initialTrending = [
    { id: "_G0ZDXq7T-I", url: "https://www.youtube.com/watch?v=_G0ZDXq7T-I", title: "Tarkan - Yolla", duration: "4:46", seconds: 286, views: "138M izlenme", ago: "Trend", thumbnail: "https://i.ytimg.com/vi/_G0ZDXq7T-I/mqdefault.jpg", author: { name: "Tarkan" } },
    { id: "c9r1vfb51X8", url: "https://www.youtube.com/watch?v=c9r1vfb51X8", title: "Tarkan - Şımarık (Kiss Kiss)", duration: "3:11", seconds: 191, views: "45M izlenme", ago: "Klasik", thumbnail: "https://i.ytimg.com/vi/c9r1vfb51X8/mqdefault.jpg", author: { name: "Tarkan" } },
    { id: "NAHRPeqGcL4", url: "https://www.youtube.com/watch?v=NAHRPeqGcL4", title: "Tarkan - Kuzu Kuzu", duration: "4:02", seconds: 242, views: "168M izlenme", ago: "Trend", thumbnail: "https://i.ytimg.com/vi/NAHRPeqGcL4/mqdefault.jpg", author: { name: "Tarkan" } },
    { id: "kJQP7kiw5Fk", url: "https://www.youtube.com/watch?v=kJQP7kiw5Fk", title: "Luis Fonsi - Despacito ft. Daddy Yankee", duration: "4:41", seconds: 281, views: "8.4B izlenme", ago: "Hit", thumbnail: "https://i.ytimg.com/vi/kJQP7kiw5Fk/mqdefault.jpg", author: { name: "Luis Fonsi" } },
    { id: "fJ9rUzIMcZQ", url: "https://www.youtube.com/watch?v=fJ9rUzIMcZQ", title: "Queen - Bohemian Rhapsody", duration: "5:59", seconds: 359, views: "1.7B izlenme", ago: "Efsane", thumbnail: "https://i.ytimg.com/vi/fJ9rUzIMcZQ/mqdefault.jpg", author: { name: "Queen Official" } },
    { id: "JGwWNGJdvx8", url: "https://www.youtube.com/watch?v=JGwWNGJdvx8", title: "Ed Sheeran - Shape of You", duration: "4:23", seconds: 263, views: "6.2B izlenme", ago: "Popüler", thumbnail: "https://i.ytimg.com/vi/JGwWNGJdvx8/mqdefault.jpg", author: { name: "Ed Sheeran" } },
    { id: "4NRXx6U8ABQ", url: "https://www.youtube.com/watch?v=4NRXx6U8ABQ", title: "The Weeknd - Blinding Lights", duration: "4:20", seconds: 260, views: "850M izlenme", ago: "Hit", thumbnail: "https://i.ytimg.com/vi/4NRXx6U8ABQ/mqdefault.jpg", author: { name: "The Weeknd" } },
    { id: "hT_nvWreIhg", url: "https://www.youtube.com/watch?v=hT_nvWreIhg", title: "OneRepublic - Counting Stars", duration: "4:43", seconds: 283, views: "4.0B izlenme", ago: "Hit", thumbnail: "https://i.ytimg.com/vi/hT_nvWreIhg/mqdefault.jpg", author: { name: "OneRepublic" } }
];

let trendingCache = { data: initialTrending, timestamp: Date.now() };

// =========================================================================
// 1. /api/search - Optimize Edilmiş Hızlı Arama Rotası
// =========================================================================
app.get('/api/search', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query || typeof query !== 'string' || !query.trim()) {
            return res.status(400).json({ success: false, error: 'Arama terimi giriniz.' });
        }

        const trimmedQuery = query.trim();

        // 1. Önce Hızlı Önbelleği Kontrol Et (0 ms Dönüş)
        const cachedResults = getCachedSearch(trimmedQuery);
        if (cachedResults) {
            return res.json({
                success: true,
                fromCache: true,
                query: trimmedQuery,
                count: cachedResults.length,
                results: cachedResults
            });
        }

        // 2. Önbellekte yoksa YouTube'da ara (İlk 8-10 sonuç ile sınırlandırılmış)
        const searchResults = await ytSearch(trimmedQuery);
        const videos = (searchResults.videos || []).slice(0, 10).map(v => ({
            id: v.videoId,
            url: v.url,
            title: v.title,
            duration: v.timestamp || '0:00',
            seconds: v.seconds || 0,
            views: formatViews(v.views),
            ago: v.ago || 'Son zamanlarda',
            // Veri transferini ve yüklenmeyi hızlandırmak için hafif 'mqdefault.jpg' görseli
            thumbnail: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
            author: { name: v.author ? v.author.name : 'Sanatçı' }
        }));

        // Önbelleğe al
        setCachedSearch(trimmedQuery, videos);

        res.json({
            success: true,
            fromCache: false,
            query: trimmedQuery,
            count: videos.length,
            results: videos
        });
    } catch (err) {
        console.error('[ARAMA HATASI]:', err.message);
        res.status(500).json({ success: false, error: 'Arama sırasında hata: ' + err.message });
    }
});

// =========================================================================
// 2. /api/trending - Optimize Edilmiş Trend Müzikler
// =========================================================================
app.get('/api/trending', async (req, res) => {
    try {
        const now = Date.now();
        if (now - trendingCache.timestamp > 15 * 60 * 1000 || !trendingCache.data.length) {
            ytSearch('en popüler şarkılar trend müzik 2024')
                .then(searchResults => {
                    if (searchResults && searchResults.videos && searchResults.videos.length > 0) {
                        trendingCache.data = searchResults.videos.slice(0, 12).map(v => ({
                            id: v.videoId,
                            url: v.url,
                            title: v.title,
                            duration: v.timestamp || '0:00',
                            seconds: v.seconds || 0,
                            views: formatViews(v.views),
                            ago: v.ago || 'Trend',
                            thumbnail: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
                            author: { name: v.author ? v.author.name : 'Popüler Sanatçı' }
                        }));
                        trendingCache.timestamp = Date.now();
                    }
                })
                .catch(e => console.error('[TREND HATASI]:', e.message));
        }

        res.json({
            success: true,
            results: trendingCache.data
        });
    } catch {
        res.json({ success: true, results: trendingCache.data });
    }
});

// =========================================================================
// 3. /api/stream - Gecikmesiz Time-To-First-Byte Ses Akışı (lowestaudio)
// =========================================================================
app.get('/api/stream', async (req, res) => {
    try {
        const targetUrl = resolveYouTubeUrl(req.query.url || req.query.id);
        if (!targetUrl) return res.status(400).json({ error: 'Geçersiz YouTube URL veya Video ID.' });

        // Önbellekli Video Bilgisi Alma
        const info = await getCachedInfo(targetUrl);
        
        // Hızlı arabelleğe alma ve anında başlatma için optimize format seçimi
        let format;
        try {
            format = chooseFormat(info.formats, {
                filter: { hasAudio: true, hasVideo: false },
                quality: 'lowestaudio'
            });
        } catch {
            format = chooseFormat(info.formats, {
                filter: f => f.hasAudio,
                quality: 'lowestaudio'
            });
        }

        if (!format) return res.status(404).json({ error: 'Ses formatı bulunamadı.' });

        const mimeType = format.mimeType ? format.mimeType.split(';')[0] : 'audio/mp4';
        const rangeHeader = req.headers.range;

        // Anında ilk baytın tarayıcıya gitmesi için küçük buffer (64KB)
        const streamOptions = {
            filter: { hasAudio: true, hasVideo: false },
            quality: 'lowestaudio',
            highWaterMark: 1 << 16, // 64KB (anında çalmaya başlar)
            dlChunkSize: 0
        };

        if (rangeHeader && format.contentLength) {
            const totalSize = parseInt(format.contentLength, 10);
            const parts = rangeHeader.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${totalSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': (end - start) + 1,
                'Content-Type': mimeType,
                'Cache-Control': 'no-cache'
            });

            const stream = ytdl.download(targetUrl, { ...streamOptions, range: { start, end } });
            stream.pipe(res);
            res.on('close', () => stream.destroy());
            stream.on('error', () => { if (!res.headersSent) res.status(500).end(); });
        } else {
            res.writeHead(200, {
                'Content-Type': mimeType,
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'no-cache',
                ...(format.contentLength ? { 'Content-Length': format.contentLength } : {})
            });

            const stream = ytdl.download(targetUrl, streamOptions);
            stream.pipe(res);
            res.on('close', () => stream.destroy());
            stream.on('error', () => { if (!res.headersSent) res.status(500).end(); });
        }
    } catch (err) {
        console.error('[STREAM HATASI]:', err.message);
        if (!res.headersSent) res.status(500).json({ error: 'Ses akışı hatası: ' + err.message });
    }
});

// =========================================================================
// 4. /api/download - Yüksek Kaliteli MP3 İndirme
// =========================================================================
app.get('/api/download', async (req, res) => {
    try {
        const targetUrl = resolveYouTubeUrl(req.query.url || req.query.id);
        if (!targetUrl) return res.status(400).json({ error: 'Geçersiz YouTube URL.' });

        const info = await getCachedInfo(targetUrl);
        const format = chooseFormat(info.formats, { filter: { hasAudio: true, hasVideo: false }, quality: 'highestaudio' });
        const cleanTitle = sanitizeFilename(info.videoDetails.title || 'Muzik');

        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(cleanTitle)}.mp3"`);
        res.setHeader('Content-Type', 'audio/mpeg');
        if (format && format.contentLength) res.setHeader('Content-Length', format.contentLength);

        const stream = ytdl.download(targetUrl, { filter: { hasAudio: true, hasVideo: false }, quality: 'highestaudio' });
        stream.pipe(res);
        res.on('close', () => stream.destroy());
        stream.on('error', (err) => {
            console.error('[DOWNLOAD HATASI]:', err.message);
            if (!res.headersSent) res.status(500).json({ error: 'İndirme hatası: ' + err.message });
        });
    } catch (err) {
        console.error('[DOWNLOAD GENEL HATASI]:', err.message);
        if (!res.headersSent) res.status(500).json({ error: 'İndirme gerçekleştirilemedi: ' + err.message });
    }
});

// Sağlık Kontrolü Rotası (Render/Railway İçin)
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'Akar Fast Audio Engine', uptime: process.uptime() });
});

// =========================================================================
// REAL-TIME SOSYAL SOHBET MOTORU (SOCKET.IO)
// =========================================================================
const roomMessages = new Map();

function getRoomHistory(roomId) {
    if (!roomMessages.has(roomId)) {
        roomMessages.set(roomId, [
            {
                id: 'sys-1',
                username: 'Akar Bot',
                text: 'Akar Canlı Müzik Odasına hoş geldiniz! Şarkılar hakkında konuşun ve müzik zevkinizi paylaşın.',
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                isSystem: true
            }
        ]);
    }
    return roomMessages.get(roomId);
}

function addRoomMessage(roomId, msg) {
    const history = getRoomHistory(roomId);
    history.push(msg);
    if (history.length > 50) history.shift();
}

let onlineUsers = 0;

io.on('connection', (socket) => {
    onlineUsers++;
    io.emit('users:count', onlineUsers);

    let currentRoom = 'global';
    socket.join(currentRoom);

    socket.emit('room:history', { roomId: currentRoom, messages: getRoomHistory(currentRoom) });

    socket.on('join:room', ({ roomId, username, roomName }) => {
        if (!roomId) return;
        socket.leave(currentRoom);
        currentRoom = roomId;
        socket.join(currentRoom);

        socket.emit('room:history', {
            roomId: currentRoom,
            roomName: roomName || 'Sohbet Odası',
            messages: getRoomHistory(currentRoom)
        });

        if (username) {
            socket.to(currentRoom).emit('chat:message', {
                id: Date.now().toString(),
                username: 'Sistem',
                text: `${username} odaya katıldı.`,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                isSystem: true
            });
        }
    });

    socket.on('chat:message', (data) => {
        if (!data || !data.text || !data.text.trim()) return;

        const messageObj = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
            username: data.username || 'Misafir',
            text: data.text.trim().slice(0, 500),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            songTitle: data.songTitle || null
        };

        addRoomMessage(currentRoom, messageObj);
        io.to(currentRoom).emit('chat:message', messageObj);
    });

    socket.on('chat:reaction', (data) => {
        if (!data || !data.reaction) return;
        io.to(currentRoom).emit('chat:reaction', { reaction: data.reaction, username: data.username || 'Biri' });
    });

    socket.on('chat:typing', (data) => {
        socket.to(currentRoom).emit('chat:typing', { username: data.username, isTyping: data.isTyping });
    });

    socket.on('disconnect', () => {
        onlineUsers = Math.max(0, onlineUsers - 1);
        io.emit('users:count', onlineUsers);
    });
});

app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    res.sendFile(indexPath, (err) => {
        if (err) res.sendFile(path.join(__dirname, 'index.html'));
    });
});

server.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 Akar Optimize Edilmiş Müzik & Sohbet Sunucusu Başlatıldı!`);
    console.log(`⚡ Port: ${PORT}`);
    console.log(`💨 Bellek İçi Arama ve Akış Önbelleği Aktif!`);
    console.log(`=======================================================`);
});
