#!/usr/bin/env node

/**
 * test_start.js — Start the service locally and point Telnyx at the tunnel for testing.
 *
 * What it does (in order):
 *  1. Starts cloudflared tunnel -> captures the public HTTPS URL
 *  2. Updates .env PUBLIC_DOMAIN with the tunnel hostname
 *  3. Starts the server (npm run dev) on port 3000
 *  4. Points the Telnyx Call Control app webhook at the tunnel
 *  5. Prints "READY — call the number now"
 *
 * Order matters: server reads PUBLIC_DOMAIN at import time via load_dotenv(),
 * so .env MUST be updated before the server process starts.
 *
 * On Ctrl+C (or server crash) it automatically:
 *  - Restores the Telnyx webhook to the prod URL
 *  - Restores .env PUBLIC_DOMAIN to the prod domain
 *  - Kills the server and tunnel processes
 */

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const https = require('https');

// Load .env config
require('dotenv').config({ path: path.join(__dirname, '.env') });

// ---------------------------------------------------------------------------
// Config — reads from .env file (use .env.example as template)
// ---------------------------------------------------------------------------
const PROJECT_DIR = path.dirname(__filename);
const ENV_FILE = path.join(PROJECT_DIR, '.env');
const CLOUDFLARED = path.join(PROJECT_DIR, 'cloudflared.exe');
const CLOUDFLARED_URL_PATTERN = /(https:\/\/[\w\-\.]+\.trycloudflare\.com)/;
const NGORK_URL_PATTERN = /https:\/\/[\w\-\.]+\.ngrok-free\.app|https:\/\/[\w\-\.]+\.ngrok\.io/;

function getTimestampedLogFilename(baseName) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
    const ext = path.extname(baseName);
    const name = path.basename(baseName, ext);
    return `${name}_${timestamp}${ext}`;
}

function cleanupOldLogs(baseLogName, keepCount = 5) {
    try {
        const ext = path.extname(baseLogName);
        const name = path.basename(baseLogName, ext);
        const pattern = new RegExp(`^${name}(_\\d{4}-\\d{2}-\\d{2}_[\\d-]+)?${ext}$`);
        
        const files = fs.readdirSync(PROJECT_DIR)
            .filter(file => pattern.test(file))
            .map(file => ({
                name: file,
                time: fs.statSync(path.join(PROJECT_DIR, file)).mtime
            }))
            .sort((a, b) => b.time - a.time);
        
        // Delete older files beyond keepCount
        for (let i = keepCount; i < files.length; i++) {
            const filePath = path.join(PROJECT_DIR, files[i].name);
            fs.unlinkSync(filePath);
            console.log(`  Cleaned up old log: ${files[i].name}`);
        }
    } catch (error) {
        // Silent fail for cleanup
    }
}

// TUNNEL: "cloudflared" or "ngrok"
// Note: ngrok needs authentication. Use cloudflared if no authtoken configured.
const TUNNEL = "cloudflared";

// Values from .env (see .env.example)
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_APP_ID  = process.env.TELNYX_APP_ID || "2922916931633677655";
const PROD_WEBHOOK   = process.env.PROD_WEBHOOK || "https://prabeo-voice-1004140955004.europe-west1.run.app/telnyx-webhook";
const PROD_DOMAIN    = process.env.PROD_DOMAIN || "prabeo-voice-1004140955004.europe-west1.run.app";
const PORT           = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Shared state (module-level, similar to Python globals)
let cf = null;
let cfLog = null;
let tunnelUrl = null;
let server = null;
// ---------------------------------------------------------------------------

function updateEnv(key, value) {
    /** Replace KEY=<anything> with KEY=value in .env (in-place). */
    const text = fs.readFileSync(ENV_FILE, 'utf-8');
    const newText = text.replace(new RegExp(`^${key}=.*$`, 'gm'), `${key}=${value}`);
    fs.writeFileSync(ENV_FILE, newText, 'utf-8');
}

function setTelnyxWebhook(url) {
    /** PATCH the Telnyx app webhook URL. Returns the confirmed URL. */
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({ webhook_event_url: url });
        const req = https.request(
            `https://api.telnyx.com/v2/call_control_applications/${TELNYX_APP_ID}`,
            {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${TELNYX_API_KEY}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data, 'utf8'),
                },
            },
            (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(JSON.parse(body).data.webhook_event_url);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${body}`));
                    }
                });
            }
        );
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

function restoreProd() {
    /** Restore Telnyx webhook and .env to production values. */
    console.log("\n► Restoring Telnyx webhook -> prod...");
    setTelnyxWebhook(PROD_WEBHOOK)
        .then(confirmed => console.log(`  Confirmed: ${confirmed}`))
        .catch(e => console.log(`  WARNING: could not restore webhook: ${e.message}`));

    console.log(`► Restoring .env PUBLIC_DOMAIN=${PROD_DOMAIN}`);
    try {
        updateEnv("PUBLIC_DOMAIN", PROD_DOMAIN);
    } catch (e) {
        console.log(`  WARNING: could not update .env: ${e.message}`);
    }
}

async function main() {
    console.log("=".repeat(60));
    console.log("  Telenyx AI Receptionist - Local Test Launcher");
    console.log("=".repeat(60));
    console.log();

    // ---------------------------------------------------------------------------
    // Step 1 — Start tunnel
    // ---------------------------------------------------------------------------
    console.log(`► [1/4] Starting ${TUNNEL} tunnel (this takes ~5 s)...`);

    // Clean up old log files (keep last 5)
    const baseLogName = TUNNEL === "ngrok" ? "ngrok_test.log" : "cloudflared_test.log";
    cleanupOldLogs(baseLogName, 5);
    
    // Create new timestamped log file
    const cfLogPath = path.join(PROJECT_DIR, getTimestampedLogFilename(baseLogName));
    cfLog = fs.createWriteStream(cfLogPath, { flags: 'w', encoding: 'utf-8' });
    console.log(`  Log file: ${path.basename(cfLogPath)}`);

try {
    await startTunnel(cfLog);
} catch (e) {
    console.log(`  ERROR: ${e.message}`);
    if (cf) cf.kill();
    process.exit(1);
}

    if (!tunnelUrl) {
        console.log(`  ERROR: ${TUNNEL} did not produce a tunnel URL.`);
        if (cf) cf.kill();
        process.exit(1);
    }

    const hostname = tunnelUrl.replace("https://", "");
    console.log(`  Tunnel URL : ${tunnelUrl}`);
    updateEnv("PUBLIC_DOMAIN", hostname);

    // ---------------------------------------------------------------------------
    // Step 2 — Update .env BEFORE starting the server
    // ---------------------------------------------------------------------------
    console.log();
    console.log(`► [2/4] Updating .env  PUBLIC_DOMAIN=${hostname}`);
    updateEnv("PUBLIC_DOMAIN", hostname);

    // ---------------------------------------------------------------------------
    // Step 3 — Start local server
    // ---------------------------------------------------------------------------
    console.log();
    console.log(`► [3/4] Starting npm run dev on port ${PORT}...`);

    // Kill any process on port 3000
    function killProcessOnPort(port) {
        return new Promise((resolve) => {
            try {
                // First try netstat to find PIDs
                const netstat = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8' });
                const lines = netstat.split('\n');
                const pids = new Set();
                
                for (const line of lines) {
                    if (line.includes('LISTENING')) {
                        const parts = line.trim().split(/\s+/);
                        if (parts.length >= 5) {
                            pids.add(parts[4]);
                        }
                    }
                }
                
                // Kill each PID
                for (const pid of pids) {
                    try {
                        execSync(`taskkill /f /pid ${pid}`, { stdio: 'ignore' });
                        console.log(`  Killed process ${pid} on port ${port}`);
                    } catch (e) {
                        // Process may have already died
                    }
                }
            } catch (error) {
                // No process found
            }
            
            // Wait for port to be fully released
            setTimeout(resolve, 3000);
        });
    }

    await killProcessOnPort(PORT);

    server = spawn('npm', ['run', 'dev'], {
        cwd: PROJECT_DIR,
        env: { ...process.env, PORT: PORT.toString() },
        stdio: 'inherit',
        shell: true
    });

    server.on('error', (err) => {
        console.log(`  ERROR: Server spawn error: ${err.message}`);
        restoreProd();
        if (cf) cf.kill();
        process.exit(1);
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 5000));

    if (server.exitCode !== null) {
        console.log("  ERROR: Server exited immediately.");
        restoreProd();
        if (cf) cf.kill();
        process.exit(1);
    }
    console.log(`  Server PID ${server.pid} — listening on http://localhost:${PORT}`);

    // ---------------------------------------------------------------------------
    // Step 4 — Point Telnyx at the endpoint
    // ---------------------------------------------------------------------------
    console.log();
    const webhook = `${tunnelUrl}/api/v1/telnyx/inbound`;
    console.log(`► [4/4] Pointing Telnyx webhook -> ${webhook}`);

    try {
        const confirmed = await setTelnyxWebhook(webhook);
        console.log(`  Telnyx confirmed: ${confirmed}`);

        // -----------------------------------------------------------------------
        // Ready!
        // -----------------------------------------------------------------------
        console.log();
        console.log("=".repeat(60));
        console.log("  READY — call the Telnyx number now!");
        console.log(`  Tunnel  : ${tunnelUrl}`);
        console.log(`  Webhook : ${webhook}`);
        console.log(`  Logs    : ${cfLogPath}`);
        console.log();
        console.log("  Press Ctrl+C to stop and restore prod settings.");
        console.log("=".repeat(60));
        console.log();

        // Wait for Ctrl+C
        process.stdin.resume();
        await new Promise(() => {}); // Wait forever
    } catch (e) {
        console.log(`  ERROR: could not update Telnyx webhook: ${e.message}`);
        restoreProd();
        server.kill();
        if (cf) cf.kill();
        process.exit(1);
    }
}

function startTunnel(logStream) {
    return new Promise((resolve, reject) => {
        const outputBuffer = [];

        if (TUNNEL === "ngrok") {
            const ngrokCmd = path.join("C:", "Users", "ReMarkt", "AppData", "Roaming", "npm", "ngrok.cmd");
            // Kill existing ngrok
            try {
                execSync('taskkill /f /im ngrok.exe', { stdio: 'ignore' });
                console.log("  Killed existing ngrok processes");
            } catch {}
            try {
                execSync(`"${ngrokCmd}" kill all`, { stdio: 'ignore' });
                console.log("  Killed existing ngrok tunnels");
            } catch {}

            cf = spawn(ngrokCmd, ["http", PORT.toString()], {
                cwd: PROJECT_DIR,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            console.log("  Waiting for ngrok to start...");
            const timeout = setTimeout(() => {
                const allOutput = outputBuffer.join('');
                console.log(`\n  Debug: Full output:`);
                console.log(allOutput.substring(0, 1500));
                // Try multiple patterns
                const patterns = [
                    /(https:\/\/[\w\-\.]+\.ngrok-free\.app)/,
                    /(https:\/\/[\w\-\.]+\.ngrok\.io)/,
                    /(https:\/\/[\d]+\.ngrok-free\.app)/
                ];
                for (const pattern of patterns) {
                    const match = allOutput.match(pattern);
                    if (match) {
                        tunnelUrl = match[0];
                        console.log(`  Found URL with pattern ${pattern}: ${tunnelUrl}`);
                        resolve();
                        return;
                    }
                }
                reject(new Error("Timeout waiting for ngrok URL - check ngrok authentication (may need auth token)"));
            }, 20000);

            cf.stdout.on('data', (data) => {
                const text = data.toString();
                outputBuffer.push(text);
                logStream.write(text);
                if (!tunnelUrl) {
                    const patterns = [
                        /(https:\/\/[\w\-\.]+\.ngrok-free\.app)/,
                        /(https:\/\/[\w\-\.]+\.ngrok\.io)/
                    ];
                    for (const pattern of patterns) {
                        const match = text.match(pattern);
                        if (match) {
                            tunnelUrl = match[0];
                            console.log(`\n  Found ngrok URL: ${tunnelUrl}`);
                            clearTimeout(timeout);
                            resolve();
                            return;
                        }
                    }
                }
            });

            cf.stderr.on('data', (data) => {
                const text = data.toString();
                outputBuffer.push(text);
                logStream.write(text);
                if (!tunnelUrl) {
                    const patterns = [
                        /(https:\/\/[\w\-\.]+\.ngrok-free\.app)/,
                        /(https:\/\/[\w\-\.]+\.ngrok\.io)/
                    ];
                    for (const pattern of patterns) {
                        const match = text.match(pattern);
                        if (match) {
                            tunnelUrl = match[0];
                            console.log(`\n  Found ngrok URL in stderr: ${tunnelUrl}`);
                            clearTimeout(timeout);
                            resolve();
                            return;
                        }
                    }
                }
            });

            cf.on('error', (err) => {
                console.log(`\n  ERROR: ngrok process error: ${err.message}`);
                reject(err);
            });
        } else {
            cf = spawn(CLOUDFLARED, ["tunnel", "--url", `http://localhost:${PORT}`], {
                cwd: PROJECT_DIR,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            console.log("  Waiting for cloudflared to start...");
            let urlFound = false;
            const timeout = setTimeout(() => {
                if (!urlFound) {
                    const allOutput = outputBuffer.join('');
                    console.log(`\n  Debug: Full cloudflared output:`);
                    console.log(allOutput.substring(0, 3000));
                    // Try multiple patterns for trycloudflare
                    const patterns = [
                        /(https:\/\/[\w\-\.]+\.trycloudflare\.com)/,
                        /(https:\/\/[\w\-]+\.trycloudflare\.com)/,
                        /Visit it at[^\n]*?(https:\/\/[\w\-\.]+)/
                    ];
                    for (const pattern of patterns) {
                        const match = allOutput.match(pattern);
                        if (match) {
                            // Extract just the URL part
                            const urlGroups = match[0].match(/https:\/\/[\w\-\.]+\.trycloudflare\.com/);
                            if (urlGroups) {
                                tunnelUrl = urlGroups[0];
                            } else {
                                tunnelUrl = match[0];
                            }
                            console.log(`  Found URL with pattern: ${tunnelUrl}`);
                            resolve();
                            return;
                        }
                    }
                    reject(new Error("Timeout waiting for cloudflared URL"));
                }
            }, 30000);

            let lineBuffer = '';
            const lineHandler = (data) => {
                const text = data.toString();
                outputBuffer.push(text);
                logStream.write(text);
                
                // Process line by line
                lineBuffer += text;
                const lines = lineBuffer.split('\n');
                lineBuffer = lines.pop(); // Keep incomplete line

                for (const line of lines) {
                    // Look for the specific line with tunnel URL
                    if (line.includes('Visit it at') || line.includes('Your quick Tunnel')) {
                        console.log(`  [Line] ${line.trim()}`);
                    }
                    
                    // Try to extract URL
                    if (!urlFound) {
                        const match = line.match(CLOUDFLARED_URL_PATTERN);
                        if (match) {
                            urlFound = true;
                            tunnelUrl = match[0];
                            console.log(`\n  Found cloudflared URL: ${tunnelUrl}`);
                            clearTimeout(timeout);
                            resolve();
                            return;
                        }
                    }
                }
            };

            cf.stdout.on('data', lineHandler);
            cf.stderr.on('data', lineHandler);

            cf.on('error', (err) => {
                console.log(`\n  ERROR: cloudflared process error: ${err.message}`);
                reject(err);
            });
        }
    });
}

// Handle Ctrl+C
process.on('SIGINT', () => {
    restoreProd();
    if (server) server.kill();
    if (cf) cf.kill();
    if (cfLog) cfLog.end();
    console.log("► Done.");
    process.exit(0);
});

main().catch(console.error);

// ---------------------------------------------------------------------------
// Cleanup on exit
// ---------------------------------------------------------------------------
process.on('SIGINT', () => {
    restoreProd();
    server.kill();
    if (cf) cf.kill();
    cfLog.end();
    console.log("► Done.");
    process.exit(0);
});