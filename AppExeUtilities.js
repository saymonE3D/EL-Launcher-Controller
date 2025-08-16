const path = require('path');
const fs = require('fs');
const { spawn, exec } = require("child_process");
const os = require("os");

function getVersionArray(versionString) {
    return versionString.split('.').map(num => parseInt(num, 10)).filter(num => !isNaN(num));
}

function PromiseExec(app) {
    return new Promise((resolve, reject) => {
        let child = exec(app);
        let stdout = '';
        let stderr = '';

        child.addListener('error', reject);

        child.stdout.on('data', function (data) {
            stdout += data;
        });

        child.stderr.on('data', function (data) {
            stderr += data;
        });

        child.addListener('close', (code) => {
            resolve({ stdout, stderr, code });
        });
    });
}

function normalizeForWmic(appExePath) {
    let cleaned = appExePath.replace(/\\\\+/g, '\\').replace(/\\/g, '/');
    let normalized = cleaned.replace(/\//g, '\\\\');
    normalized = normalized.replace(/^([a-z]):/i, function(_, drive) {
        return drive.toUpperCase() + ':';
    });
    return normalized;
}

function normalizeBackslashes(appExePath) {
    appExePath = appExePath.replace(/\\\\\\\\/g, '\\\\');
    appExePath = appExePath.replace(/(?<!\\)\\(?!\\)/g, '\\\\');
    return appExePath;
}

async function getAppVersionString(appExePath) {
    let fixedPath = normalizeForWmic(appExePath);
    fixedPath = normalizeBackslashes(fixedPath);
    const cmd = `wmic datafile where "name='${fixedPath}'" get version`;

    try {
        const { stdout, stderr } = await PromiseExec(cmd);

        if (stderr) {
            throw new Error(`Error retrieving version: ${stderr}`);
        }

        const versionString = stdout.split('\n')[1]?.trim();
        if (versionString) {
            return versionString;
        } else {
            throw new Error("Error: Unable to retrieve version string.");
        }
    } catch (err) {
        throw new Error(`Unexpected error: ${err.message}`);
    }
}

function findAppExePath(appName, searchPaths) {
    const foundPaths = [];
    for (const searchPath of searchPaths) {
        const fullPath = path.join(searchPath, appName);
        if (fs.existsSync(fullPath)) {
            return fullPath;
        } else if (fs.existsSync(fullPath)) {
            foundPaths.push(fullPath);
        }
    }
    return foundPaths.length > 0 ? foundPaths : null;
}

function constructExpectedExePath(rootAppDir, owner, appName, version, extension) {
    const paths = {
        rootAppDir,
        ownerDir: path.join(rootAppDir, owner),
        appDir: path.join(rootAppDir, owner, appName),
        versionDir: path.join(rootAppDir, owner, appName, version),
        exePath: path.join(rootAppDir, owner, appName, version, `${appName}.${extension}`)
    };
    return paths;
}

function launchExeWithArgs(appExePath, ExeArgsList, callbacks) {
    if (!fs.existsSync(appExePath)) {
        throw new Error(`Executable path not found: ${appExePath}`);
    }

    var child_process = spawn(appExePath, ExeArgsList);

    child_process.stdout.on('data', function (data) {
        callbacks.onData && callbacks.onData(data);
    });

    child_process.stderr.on('data', function (data) {
        callbacks.onErrorData && callbacks.onErrorData(data);
    });

    child_process.on('close', function (code, signal) {
        callbacks.onClose && callbacks.onClose({ code, signal });
    });

    child_process.on('exit', function (code, signal) {
        callbacks.onExit && callbacks.onExit({ code, signal });
    });

    return child_process;
}

function executePSScript(cmd, title) {
    try {
        const child = spawn("powershell.exe", [cmd]);

        child.stdout.on("data", function (data) {
            if (data.toString().trim() === "Process killed") {
                // Process killed successfully
            }
        });

        child.stderr.on("data", function (data) {
            throw new Error(`${title} PowerShell Error: ${data}`);
        });

        child.on("exit", function () {
            // PowerShell script complete
        });

        child.stdin.end();
    } catch (e) {
        throw new Error(`${title} ERROR: Execution failed with message: ${e.message}`);
    }
}

function pidIsRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        return false;
    }
}

async function shutDownSingleExe(appName, exepath, pid, intervalId, StreamerPort, config, ShouldTryRawCmd = false, logProcessIds = [], ioClient4SS = undefined, entry = undefined) {
    if (!appName || !exepath || !pid) {
        throw new Error("Invalid parameters: 'appName', 'exepath', and 'pid' are required.");
    }

    if (!pidIsRunning(pid)) {
        throw new Error(`Process with PID ${pid} is not running. Skipping termination.`);
    }

    if (intervalId) clearInterval(intervalId);

    const isWin = /^win/.test(process.platform);
    const killCommand = isWin ? 'taskkill /PID ' + pid + ' /T /F' : `kill -9 ${pid}`;

    exec(killCommand, (error, stdout, stderr) => {
        if (error) {
            throw new Error(`Error terminating process with PID ${pid}: ${stderr || error.message}`);
        }

        if (pidIsRunning(pid)) {
            throw new Error(`Failed to terminate process with PID ${pid}; it may still be running.`);
        }

        shutDownSingleExe2(appName, StreamerPort, config);
    });

    if (os.platform() === 'linux') {
        const script = `kill -9 ${logProcessIds.join(" ")}`;
        exec(script, (err, stdout, stderr) => {
            // Handle Linux process cleanup
        });
    }
}

async function shutDownSingleExe2(app, StreamerPort = "", config) {
    if (!app || StreamerPort === undefined || !config) {
        throw new Error("Invalid parameters: 'app', 'StreamerPort', and 'config' are required.");
    }

    if (config.shouldDoExtensiveProcessCleanup != undefined && !config.shouldDoExtensiveProcessCleanup) {
        return;
    }

    try {
        const { stop } = require(`./StopApp.js`);
        return await stop();
    } catch (e) {
        // Handle error silently
    }

    const shouldKillAllPsUeAppUponExit = config.shouldKillAllPsUeAppUponExit ? 1 : 0;
    const cmd = `.\\StopApp.ps1 ${app} ${StreamerPort} ${shouldKillAllPsUeAppUponExit}`;

    executePSScript(cmd, "shutDownSingleExe2");
}

module.exports = {
    getVersionArray,
    getAppVersionString,
    findAppExePath,
    launchExeWithArgs,
    constructExpectedExePath,
    executePSScript,
    shutDownSingleExe,
    shutDownSingleExe2,
    pidIsRunning
};