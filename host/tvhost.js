"use strict";
/*
 * tvhost — runs on the Hisense VIDAA TV (Node 20 via the phoenix binary).
 *
 *  - minimal MQTT 3.1.1 client over TLS to the TV's own broker (127.0.0.1:36669)
 *    using the Vidaa mobile client certificate, so it can list apps/sources,
 *    switch inputs and launch apps without any PC.
 *  - HTTP + WebSocket server on 127.0.0.1:8766 serving the launcher, the games
 *    and the lab.
 *  - remembers the last source and switches back to it after boot.
 *
 * Everything lives on writable partitions: /var/local/tvhost.
 */
const tls = require("tls");
const fs = require("fs");
const http = require("http");
const crypto = require("crypto");
const path = require("path");

const BASE = "/var/local/tvhost";
const KEYS = BASE + "/keys";
const WWW = BASE + "/www";
const SETTINGS = BASE + "/settings.json";
const LOG = BASE + "/tvhost.log";
const PORT = 8766;

function log(msg) {
    const line = new Date().toISOString() + " " + msg + "\n";
    try { fs.appendFileSync(LOG, line); } catch (e) {}
}

function readJSON(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return fallback; }
}

function writeJSON(file, obj) {
    try { fs.writeFileSync(file, JSON.stringify(obj, null, 2)); } catch (e) { log("write " + file + ": " + e.message); }
}

let settings = readJSON(SETTINGS, {
    autoSwitch: true,
    lastSource: null,
    hidden: [],
    apps: []          // [{id,name,kind,appName?}]  appName = TV app to launch
});

/* ------------------------------------------------------------------ MQTT */

function varint(n) {
    const out = [];
    do {
        let b = n & 0x7f;
        n >>= 7;
        if (n > 0) b |= 0x80;
        out.push(b);
    } while (n > 0);
    return Buffer.from(out);
}

function str(s) {
    const b = Buffer.from(s, "utf8");
    const len = Buffer.alloc(2);
    len.writeUInt16BE(b.length, 0);
    return Buffer.concat([len, b]);
}

function packet(type, flags, body) {
    return Buffer.concat([Buffer.from([(type << 4) | flags]), varint(body.length), body]);
}

class Mqtt {
    constructor(tokens) {
        this.tokens = tokens;
        this.sock = null;
        this.buf = Buffer.alloc(0);
        this.pid = 1;
        this.connected = false;
        this.handlers = {};
        this.pingTimer = null;
        this.retry = 0;
    }

    /* PUBLISH to /remoteapp/tv/<service>/<client>/actions/<action> */
    action(service, action, payload) {
        if (!this.connected) { log("action skipped (offline): " + action); return; }
        const topic = "/remoteapp/tv/" + service + "/" + this.tokens._client_id + "/actions/" + action;
        const body = Buffer.from(JSON.stringify(payload || {}), "utf8");
        const t = str(topic);
        this.writePacket(packet(3, 0, Buffer.concat([t, body])));
    }

    writePacket(buf) {
        try { this.sock.write(buf); } catch (e) { log("write: " + e.message); }
    }

    subscribe(topics) {
        const parts = [Buffer.alloc(2)];
        parts[0].writeUInt16BE(this.pid++ & 0xffff, 0);
        topics.forEach(t => { parts.push(str(t)); parts.push(Buffer.from([0])); });
        this.writePacket(packet(8, 2, Buffer.concat(parts)));
    }

    connect() {
        const cert = fs.readFileSync(KEYS + "/vidaa_cert.pem");
        const key = fs.readFileSync(KEYS + "/vidaa_key.pem");
        const sock = tls.connect({
            host: "127.0.0.1", port: 36669, cert: cert, key: key,
            rejectUnauthorized: false, servername: "localhost"
        }, () => {
            const flags = 0x02 | 0x80 | 0x40; // clean session + username + password
            const body = Buffer.concat([
                str("MQTT"), Buffer.from([4, flags]), Buffer.from([0, 60]),
                str(this.tokens._client_id),
                str(this.tokens._username),
                str(this.tokens.accesstoken)
            ]);
            this.writePacket(packet(1, 0, body));
        });
        sock.setNoDelay(true);
        sock.on("data", d => this.onData(d));
        sock.on("error", e => {
            log("tls: " + e.message);
            try { sock.destroy(); } catch (x) {}
        });
        sock.on("close", () => {
            this.connected = false;
            this.sock = null;
            if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
            this.retry = Math.min(this.retry + 1, 10);
            setTimeout(() => this.connect(), 2000 * this.retry);
        });        this.sock = sock;
    }

    onData(d) {
        this.buf = Buffer.concat([this.buf, d]);
        for (;;) {
            if (this.buf.length < 2) return;
            let mult = 1, len = 0, i = 1, b = 0;
            do {
                if (i >= this.buf.length) return;
                b = this.buf[i++];
                len += (b & 0x7f) * mult;
                mult *= 128;
            } while (b & 0x80);
            if (this.buf.length < i + len) return;
            const type = this.buf[0] >> 4;
            const body = this.buf.slice(i, i + len);
            this.buf = this.buf.slice(i + len);
            this.handle(type, body);
        }
    }

    handle(type, body) {
        if (type === 2) { // CONNACK
            const rc = body[1];
            if (rc !== 0) { log("CONNACK refused rc=" + rc); return; }
            this.connected = true;
            this.retry = 0;
            log("MQTT connected as " + this.tokens._client_id);
            const base = "/remoteapp/mobile/" + this.tokens._client_id + "/";
            this.subscribe([
                base + "ui_service/data/applist",
                base + "ui_service/data/sourcelist",
                base + "ui_service/data/gettvstate",
                base + "ui_service/data/launchapp",
                base + "ui_service/data/changesource",
                base + "platform_service/data/gettoken",
                "/remoteapp/mobile/broadcast/ui_service/state"
            ]);
            this.pingTimer = setInterval(() => this.writePacket(packet(12, 0, Buffer.alloc(0))), 30000);
            this.action("ui_service", "gettvstate", {});
            this.action("ui_service", "applist", {});
            this.action("ui_service", "sourcelist", {});
            if (this.online) this.online();
            return;
        }
        if (type === 3) { // PUBLISH
            const tl = body.readUInt16BE(0);
            const topic = body.slice(2, 2 + tl).toString("utf8");
            const payload = body.slice(2 + tl).toString("utf8");
            this.onMessage(topic, payload);
        }
    }

    onMessage(topic, raw) {
        let data = null;
        try { data = JSON.parse(raw); } catch (e) { return; }
        const action = topic.split("/").pop();
        const fn = this.handlers[action];
        if (fn) fn(data);
    }
}

/* --------------------------------------------------------------- bridge */

const state = {
    apps: [],
    sources: [],
    current: null,
    tvState: null
};

const clients = new Set();

function iconFor(app) {
    const id = String(app.appId);
    try {
        if (fs.existsSync(WWW + "/icons/" + id + ".png")) return "/icons/" + id + ".png";
    } catch (e) {}
    return null;
}

const SRC_ICONS = {
    tv: "src-tv", hdmi1: "src-hdmi1", hdmi2: "src-hdmi2",
    hdmi3: "src-hdmi3", hdmi4: "src-hdmi4", av: "src-av",
    "music sharing": "src-music"
};

function srcIcon(key, name) {
    const k = String(key || "").toLowerCase();
    const n = String(name || "").toLowerCase();
    let file = null;
    /* the device name wins: an HDMI input can be a Google TV or a soundbar */
    if (n.indexOf("google") !== -1 || n.indexOf("chromecast") !== -1) file = "src-google";
    else if (n.indexOf("sound") !== -1 || n.indexOf("barre") !== -1) file = "src-soundbar";
    else if (k.indexOf("music") === 0) file = "src-music";
    else if (SRC_ICONS[k]) file = SRC_ICONS[k];
    else if (k.indexOf("hdmi") === 0) file = "src-hdmi" + (k.match(/\d/) ? k.match(/\d/)[0] : "1");
    else if (k === "tv" || n.indexOf("télé") === 0 || n.indexOf("tv channels") === 0) file = "src-tv";
    if (!file) return null;
    try {
        if (fs.existsSync(WWW + "/icons/" + file + ".png")) return "/icons/" + file + ".png";
    } catch (e) {}
    return null;
}

function snapshot() {
    const hidden = settings.hidden || [];
    const custom = settings.apps
        .filter(a => hidden.indexOf(a.id) === -1)
        .map(a => ({ id: a.id, name: a.name, kind: a.kind || "app", sub: a.sub || "", icon: a.icon || null }));
    const tv = (state.tvApps || [])
        .filter(a => a && a.name && hidden.indexOf(String(a.appId)) === -1)
        .map(a => {
            const icon = iconFor(a);
            return { id: String(a.appId), name: a.name, kind: "tv", sub: "", icon: icon };
        });
    const recent = settings.recent || [];
    const ordered = state.sources
        .filter(s => hidden.indexOf(s.key) === -1)
        .slice()
        .sort((a, b) => {
            const ia = recent.indexOf(a.key), ib = recent.indexOf(b.key);
            const ra = ia === -1 ? 999 : ia, rb = ib === -1 ? 999 : ib;
            return ra - rb;
        });
    return {
        t: "state",
        apps: tv.concat(custom),
        sources: ordered.map(s => ({ id: s.key, name: s.name, signal: !!s.signal, icon: srcIcon(s.key, s.name) })),
        current: state.current,
        settings: { autoSwitch: !!settings.autoSwitch, hidden: hidden }
    };
}

function broadcast() {
    const msg = JSON.stringify(snapshot());
    clients.forEach(ws => { try { wsSend(ws, msg); } catch (e) {} });
}

const SRC_KEYS = { "tv": "tv", "hdmi1": "hdmi1", "hdmi2": "hdmi2", "hdmi3": "hdmi3", "hdmi4": "hdmi4" };

function sourceKey(s) {
    const n = String(s.sourcename || "").toLowerCase();
    if (n.indexOf("hdmi") === 0) return n;
    if (n.indexOf("tv") === 0 || n.indexOf("dtv") === 0 || n.indexOf("atv") === 0) return "tv";
    return n;
}

const NAME_FIX = {
    "google tv stre": "Google TV",
    "tv channels": "Télé",
    "tv channels?": "Télé",
    "partage de musique": "Musique"
};

function prettyName(raw) {
    const n = String(raw || "").trim();
    const k = n.toLowerCase();
    if (NAME_FIX[k]) return NAME_FIX[k];
    if (k.indexOf("google tv str") === 0) return "Google TV";
    return n;
}

function applySourceList(list) {
    state.sources = list.map(s => ({
        id: s.sourceid,
        key: sourceKey(s),
        name: prettyName(s.displayname2 || s.displayname || s.sourcename),
        raw: s,
        signal: s.is_signal === "1" || s.has_signal === "1"
    }));
    broadcast();
}

function applyAppList(list) {
    state.tvApps = list;
}

function tvAppByName(name) {
    const want = String(name || "").toLowerCase();
    const list = state.tvApps || [];
    return list.find(a => (a.name || "").toLowerCase() === want) ||
        list.find(a => (a.name || "").toLowerCase().indexOf(want) !== -1);
}

/* ---------------------------------------------------------------- shell */

const net = require("net");

function runShell(cmd, done) {
    if (!cmd.trim()) { done(""); return; }
    let out = "";
    let finished = false;
    const finish = () => { if (finished) return; finished = true; try { sock.destroy(); } catch (e) {} done(out.split("__END__")[0]); };
    const sock = net.connect(2324, "127.0.0.1", () => {
        sock.write(cmd + "\n; echo __END__\n");
    });
    sock.setTimeout(20000, finish);
    sock.on("data", d => {
        out += d.toString("utf8");
        if (out.indexOf("__END__") !== -1) finish();
        if (out.length > 200000) finish();
    });
    sock.on("error", e => { finished = true; done("erreur shell: " + e.message); });
    sock.on("close", finish);
}

/* ---------------------------------------------------------------- HTTP */

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml"
};

function serveFile(res, rel) {
    const file = path.join(WWW, path.normalize(rel).replace(/^(\.\.[\/\\])+/, ""));
    sendFile(res, file);
}

function serveAbsolute(res, file) {
    const norm = path.normalize(file);
    if (norm.indexOf("/opt/pkgs/tv.vidaa.app.ui/") !== 0) { res.writeHead(403); res.end(); return; }
    sendFile(res, norm);
}

function sendFile(res, file) {
    fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("not found"); return; }
        res.writeHead(200, {
            "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
            "Cache-Control": "no-store"
        });
        res.end(data);
    });
}

const server = http.createServer((req, res) => {
    const url = req.url.split("?")[0];
    log("GET " + req.method + " " + url + " ua=" + String(req.headers["user-agent"] || "").slice(0, 40));
    if (req.method === "POST" && url === "/api/sh") {
        let body = "";
        req.on("data", c => { body += c; if (body.length > 20000) req.destroy(); });
        req.on("end", () => {
            let cmd = "";
            try { cmd = JSON.parse(body).cmd || ""; } catch (e) {}
            runShell(String(cmd).slice(0, 2000), out => {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ out: out }));
            });
        });
        return;
    }
    if (url === "/api/state") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(snapshot()));
        return;
    }
    if (url === "/api/home") {
        launchOurHome(true);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
    }
    if (url === "/api/switch") {
        const key = (new URL(req.url, "http://x")).searchParams.get("id") || "";
        const s = state.sources.find(x => x.key === key);
        if (!s) { res.writeHead(404); res.end("no source"); return; }
        if (mqtt) mqtt.action("ui_service", "changesource", s.raw);
        settings.lastSource = s.key;
        writeJSON(SETTINGS, settings);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, switched: s.key }));
        return;
    }
    if (url === "/api/sources") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(state.sources));
        return;
    }
    if (url === "/api/apps") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(state.tvApps || []));
        return;
    }
    if (url === "/" || url === "/index.html") { serveFile(res, "launcher/index.html"); return; }
    if (url.indexOf("/stock/") === 0) {
        serveAbsolute(res, "/opt/pkgs/tv.vidaa.app.ui/hisenseUI/" + url.slice(7));
        return;
    }
    serveFile(res, url.charAt(url.length - 1) === "/" ? url.slice(1) + "index.html" : url.slice(1));
});

/* ------------------------------------------------------------ WebSocket */

let mqtt = null;

function wsAccept(key) {
    return crypto.createHash("sha1")
        .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
}

function wsSend(sock, text) {
    const payload = Buffer.from(text, "utf8");
    let head;
    if (payload.length < 126) {
        head = Buffer.from([0x81, payload.length]);
    } else if (payload.length < 65536) {
        head = Buffer.alloc(4);
        head[0] = 0x81; head[1] = 126; head.writeUInt16BE(payload.length, 2);
    } else {
        head = Buffer.alloc(10);
        head[0] = 0x81; head[1] = 127;
        head.writeBigUInt64BE(BigInt(payload.length), 2);
    }
    sock.write(Buffer.concat([head, payload]));
}

function wsParse(buf) {
    /* returns {opcode, payload, rest} or null when incomplete */
    if (buf.length < 2) return null;
    const opcode = buf[0] & 0x0f;
    let len = buf[1] & 0x7f;
    let off = 2;
    if (len === 126) {
        if (buf.length < 4) return null;
        len = buf.readUInt16BE(2); off = 4;
    } else if (len === 127) {
        if (buf.length < 10) return null;
        len = Number(buf.readBigUInt64BE(2)); off = 10;
    }
    const masked = buf[1] & 0x80;
    let mask = null;
    if (masked) {
        if (buf.length < off + 4) return null;
        mask = buf.slice(off, off + 4);
        off += 4;
    }
    if (buf.length < off + len) return null;
    let payload = buf.slice(off, off + len);
    if (mask) {
        const out = Buffer.alloc(len);
        for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i % 4];
        payload = out;
    }
    return { opcode: opcode, payload: payload, rest: buf.slice(off + len) };
}

server.on("upgrade", (req, sock) => {
    if (req.url.split("?")[0] !== "/ws") { sock.destroy(); return; }
    const key = req.headers["sec-websocket-key"];
    sock.write("HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
        "Sec-WebSocket-Accept: " + wsAccept(key) + "\r\n\r\n");
    clients.add(sock);
    wsSend(sock, JSON.stringify(snapshot()));

    let buf = Buffer.alloc(0);
    sock.on("data", d => {
        buf = Buffer.concat([buf, d]);
        for (;;) {
            const f = wsParse(buf);
            if (!f) return;
            buf = f.rest;
            if (f.opcode === 8) { clients.delete(sock); sock.destroy(); return; }
            if (f.opcode !== 1) continue;
            let msg;
            try { msg = JSON.parse(f.payload.toString("utf8")); } catch (e) { continue; }
            handleClient(msg, sock);
        }
    });
    sock.on("close", () => clients.delete(sock));
    sock.on("error", () => clients.delete(sock));
});

function reply(sock, obj) { try { wsSend(sock, JSON.stringify(obj)); } catch (e) {} }

function handleClient(msg, sock) {
    if (msg.t === "launch") {
        const app = settings.apps.find(a => a.id === msg.id);
        if (!app) {
            const tv = (state.tvApps || []).find(a => String(a.appId) === String(msg.id));
            if (!tv) { reply(sock, { t: "error", message: "app inconnue" }); return; }
            if (mqtt) mqtt.action("ui_service", "launchapp", {
                appId: tv.appId, name: tv.name, url: tv.url,
                urlType: tv.urlType, storeType: tv.storeType
            });
            reply(sock, { t: "ok" });
            return;
        }
        if (app.kind === "url") {
            if (mqtt) mqtt.action("ui_service", "launchapp",
                { appId: app.id, name: app.name, url: app.url, urlType: "1", storeType: "custom" });
            reply(sock, { t: "ok" });
            return;
        }
        const tv = tvAppByName(app.appName || app.name);
        if (!tv) { reply(sock, { t: "error", message: "app absente du téléviseur" }); return; }
        if (mqtt) mqtt.action("ui_service", "launchapp", {
            appId: tv.appId, name: tv.name, url: tv.url,
            urlType: tv.urlType, storeType: tv.storeType
        });
        reply(sock, { t: "ok" });
        return;
    }
    if (msg.t === "source") {
        const s = state.sources.find(x => x.key === msg.id);
        if (!s) { reply(sock, { t: "error", message: "source inconnue" }); return; }
        if (mqtt) mqtt.action("ui_service", "changesource", s.raw);
        settings.lastSource = s.key;
        const rec = settings.recent || [];
        settings.recent = [s.key].concat(rec.filter(k => k !== s.key)).slice(0, 8);
        writeJSON(SETTINGS, settings);
        broadcast();
        reply(sock, { t: "ok" });
        return;
    }
    if (msg.t === "setting") {
        if (msg.key === "autoSwitch") settings.autoSwitch = !!msg.value;
        if (msg.key === "lastSource") settings.lastSource = msg.value;
        if (msg.key === "hidden" && Array.isArray(msg.value)) settings.hidden = msg.value;
        writeJSON(SETTINGS, settings);
        broadcast();
        reply(sock, { t: "ok" });
        return;
    }
    reply(sock, { t: "error", message: "commande inconnue" });
}

/* ---------------------------------------------------------------- boot */

const TOKENS = KEYS + "/tokens.json";

function boot() {
    const tokens = readJSON(TOKENS, null);
    if (!tokens || !tokens.accesstoken) { log("no tokens — cannot reach the TV broker"); return; }
    mqtt = new Mqtt(tokens);
    mqtt.handlers = {
        applist: d => applyAppList(Array.isArray(d) ? d : (d.applist || [])),
        sourcelist: d => applySourceList(Array.isArray(d) ? d : (d.sourcelist || [])),
        gettvstate: d => {
            state.tvState = d;
            log("tvstate " + JSON.stringify(d).slice(0, 200));
            if (d.statetype === "remote_launcher") {
                settings.lastIsSource = false;
                writeJSON(SETTINGS, settings);
            } else if (d.source) {
                settings.lastSource = sourceKey({ sourcename: d.source });
                settings.lastIsSource = true;
                writeJSON(SETTINGS, settings);
            }
            broadcast();
        },
        state: d => {
            if (d.statetype === "sourceswitch" && d.source) {
                const k = sourceKey(d);
                state.current = k;
                settings.lastIsSource = true;
                if (k && k !== settings.lastSource) {
                    settings.lastSource = k;
                    log("remembered source " + k);
                }
                const rec = settings.recent || [];
                settings.recent = [k].concat(rec.filter(x => x !== k)).slice(0, 8);
                writeJSON(SETTINGS, settings);
            }
            if (d.statetype === "remote_launcher") {
                settings.lastIsSource = false;
                writeJSON(SETTINGS, settings);
            }
            broadcast();
        }
    };
    mqtt.online = () => {
        log("online");
        setTimeout(autoswitch, 4000);
        if (global.__poll) clearInterval(global.__poll);
        global.__poll = setInterval(() => {
            if (!mqtt || !mqtt.connected) return;
            mqtt.action("ui_service", "gettvstate", {});
        }, 12000);
    };
    mqtt.connect();
}

let switchedOnce = false;
let launchedHome = false;
let launchEnabled = true;
let lastHandoff = 0;

const LAUNCHER_URL = "http://127.0.0.1:8766/?home=1";

function launchOurHome(force) {
    if (launchedHome && !force) return;
    launchedHome = true;
    if (!mqtt) return;
    let entry = null;
    try {
        const reg = JSON.parse(fs.readFileSync("/APPS/websdk/Appinfo.json", "utf8"));
        entry = (reg.AppInfo || []).find(a => String(a.Id) === "alvidaa") || null;
    } catch (e) { log("registry read: " + e.message); }
    if (entry) {
        log("launching registry app " + entry.Id + " " + entry.URL);
        mqtt.action("ui_service", "launchapp", {
            appId: entry.Id, name: entry.AppName || entry.Title || "alvidaa",
            url: entry.URL, urlType: "1", storeType: entry.StoreType || "custom"
        });
        return;
    }
    log("registry entry missing, launching by url");
    mqtt.action("ui_service", "launchapp", {
        appId: "alvidaa", name: "alvidaa", url: LAUNCHER_URL,
        urlType: "1", storeType: "custom"
    });
}

function autoswitch() {
    if (!settings.autoSwitch) { log("autoswitch disabled"); return; }
    const s = settings.lastIsSource && settings.lastSource
        ? state.sources.find(x => x.key === settings.lastSource) : null;
    if (s && s.signal) {
        log("boot -> last source " + s.key);
        mqtt.action("ui_service", "changesource", s.raw);
        switchedOnce = true;
        return;
    }
    /* nothing to restore: land on our own launcher, never the stock home */
    log("boot -> our launcher");
    setTimeout(() => launchOurHome(true), 1500);
}

function nearBootSwitch() {
    /* only go back to an input when the TV was on that input at power-off */
    if (!settings.lastIsSource) { log("was on home at power-off — staying"); return; }
    const now = Date.now();
    if (now - lastHandoff < 10000) return;
    lastHandoff = now;
    const s = settings.lastSource ? state.sources.find(x => x.key === settings.lastSource) : null;
    if (s && s.signal) {
        log("switch back to " + s.key);
        mqtt.action("ui_service", "changesource", s.raw);
    } else {
        log("no signal on " + settings.lastSource);
    }
}

server.listen(PORT, "0.0.0.0", () => {
    log("listening on 0.0.0.0:" + PORT);
});
server.on("error", e => {
    log("listen failed: " + e.message);
    process.exit(0);
});
if (fs.existsSync(BASE + "/no-mqtt")) {
    log("mqtt disabled by flag (PC bridge owns the broker session)");
} else {
    boot();
}
