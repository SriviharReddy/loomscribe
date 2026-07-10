/**
 * logger.js — Structured JSON logger for LoomScribe
 *
 * Writes timestamped, levelled log entries to:
 *   - stdout/stderr (human-readable)
 *   - data/logs/server.log (structured JSON, one entry per line)
 *
 * Log files rotate when they exceed LOG_MAX_BYTES. Up to LOG_MAX_FILES
 * rotated archives are kept before the oldest is deleted.
 *
 * No external dependencies — uses only Node.js built-ins.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Configuration (can be overridden via environment variables)
// ---------------------------------------------------------------------------
const LOG_DIR         = process.env.LOG_DIR ? path.resolve(process.env.LOG_DIR) : path.resolve(__dirname, '../../data/logs');
const LOG_FILE        = process.env.LOG_FILE ? path.resolve(process.env.LOG_FILE) : path.join(LOG_DIR, 'server.log');
const LOG_LEVEL       = (process.env.LOG_LEVEL  || 'info').toLowerCase();   // debug | info | warn | error
const LOG_MAX_BYTES   = parseInt(process.env.LOG_MAX_BYTES  || String(5 * 1024 * 1024), 10); // 5 MB
const LOG_MAX_FILES   = parseInt(process.env.LOG_MAX_FILES  || '5', 10);
const LOG_MAX_AGE_DAYS = parseInt(process.env.LOG_MAX_AGE_DAYS || '7', 10);

// ---------------------------------------------------------------------------
// Level ordering
// ---------------------------------------------------------------------------
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const configuredLevel = LEVELS[LOG_LEVEL] ?? LEVELS.info;

// ---------------------------------------------------------------------------
// Ensure log directory exists
// ---------------------------------------------------------------------------
function ensureLogDir() {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }
}

// ---------------------------------------------------------------------------
// Log rotation
// ---------------------------------------------------------------------------
function rotateLogs() {
    try {
        if (!fs.existsSync(LOG_FILE)) return;
        const { size } = fs.statSync(LOG_FILE);
        if (size < LOG_MAX_BYTES) return;

        // Shift existing rotated files: .4 -> .5 (and delete .5 if it exists)
        for (let i = LOG_MAX_FILES - 1; i >= 1; i--) {
            const src  = `${LOG_FILE}.${i}`;
            const dest = `${LOG_FILE}.${i + 1}`;
            try {
                if (fs.existsSync(dest)) fs.unlinkSync(dest);
                if (fs.existsSync(src))  fs.renameSync(src, dest);
            } catch (e) {
                // Individual file rotation errors are non-fatal
            }
        }

        // Rename current log to .1
        try {
            fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
        } catch (renameErr) {
            // Fallback for Windows or locked files: Copy the content and truncate the source file
            try {
                const rotatedFile = `${LOG_FILE}.1`;
                if (fs.existsSync(rotatedFile)) {
                    fs.unlinkSync(rotatedFile);
                }
                fs.copyFileSync(LOG_FILE, rotatedFile);
                fs.truncateSync(LOG_FILE, 0);
            } catch (fallbackErr) {
                // If copying also fails, at least truncate the current log file to prevent infinite growth
                try {
                    fs.truncateSync(LOG_FILE, 0);
                } catch (truncateErr) {
                    // Ignore
                }
            }
        }
    } catch (e) {
        // Rotation errors are non-fatal; swallow silently
    }
}

// ---------------------------------------------------------------------------
// Auto-prune old log files
// ---------------------------------------------------------------------------
function pruneLogs() {
    try {
        if (!fs.existsSync(LOG_DIR)) return;
        const files = fs.readdirSync(LOG_DIR);
        const now = Date.now();
        const maxAgeMs = LOG_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

        files.forEach(file => {
            const match = file.match(/^server\.log\.(\d+)$/);
            if (!match) return;

            const filePath = path.join(LOG_DIR, file);
            const index = parseInt(match[1], 10);

            // 1. Delete if index exceeds LOG_MAX_FILES
            if (index > LOG_MAX_FILES) {
                try {
                    fs.unlinkSync(filePath);
                } catch (e) {}
                return;
            }

            // 2. Delete if older than LOG_MAX_AGE_DAYS
            try {
                const stat = fs.statSync(filePath);
                if (now - stat.mtimeMs > maxAgeMs) {
                    fs.unlinkSync(filePath);
                }
            } catch (e) {}
        });
    } catch (err) {
        // Ignore pruning errors to keep logging robust
    }
}

// ---------------------------------------------------------------------------
// Core write function
// ---------------------------------------------------------------------------
function writeEntry(level, event, data) {
    if (LEVELS[level] < configuredLevel) return;

    const entry = {
        ts:    new Date().toISOString(),
        level: level.toUpperCase(),
        event,
        ...data
    };

    // Pretty-print to console
    const consoleFn = level === 'error' ? console.error
                    : level === 'warn'  ? console.warn
                    : console.log;

    consoleFn(`[${entry.ts}] [${entry.level}] ${event}`, data && Object.keys(data).length ? data : '');

    // Append JSON line to log file
    try {
        ensureLogDir();
        rotateLogs();
        fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf-8');
    } catch (e) {
        // File write errors must never crash the server
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
const logger = {
    debug: (event, data = {}) => writeEntry('debug', event, data),
    info:  (event, data = {}) => writeEntry('info',  event, data),
    warn:  (event, data = {}) => writeEntry('warn',  event, data),
    error: (event, data = {}) => writeEntry('error', event, data),

    /**
     * Returns an Express middleware that logs every HTTP request/response.
     * Usage: app.use(logger.requestMiddleware())
     */
    requestMiddleware() {
        return function logRequest(req, res, next) {
            const start = Date.now();
            const { method, url } = req;

            res.on('finish', () => {
                const ms     = Date.now() - start;
                const status = res.statusCode;
                const level  = status >= 500 ? 'error'
                             : status >= 400 ? 'warn'
                             : 'info';

                // Check if request is a static asset request to avoid bloating logs
                const isStaticAsset = /\.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?|map)$/i.test(url) || url === '/favicon.ico';
                const shouldLog = !isStaticAsset || status >= 400 || LOG_LEVEL === 'debug';

                if (shouldLog) {
                    writeEntry(level, 'http_request', {
                        method,
                        url,
                        status,
                        ms,
                    });
                }
            });

            next();
        };
    }
};

// Start prune checks on startup
pruneLogs();

// Schedule periodic pruning every 12 hours
const pruneInterval = setInterval(pruneLogs, 12 * 60 * 60 * 1000);
if (typeof pruneInterval.unref === 'function') {
    pruneInterval.unref();
}

module.exports = logger;
