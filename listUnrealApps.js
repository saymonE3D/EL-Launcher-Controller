// A Node.js script to find and list running Unreal Engine Pixel Streaming processes (without killing them).
// This script is specifically designed for Windows environments using `wmic`.

const { exec } = require('child_process');

// The keywords to search for in the command line arguments.
const PIXEL_STREAMING_KEYWORDS = [
    'PixelStreamingURL',
    'PixelStreamingPort',
    'PixelStreamingID'
];

/**
 * Executes a shell command and returns a promise that resolves with the stdout.
 * @param {string} command The command to execute.
 * @returns {Promise<string>} The standard output of the command.
 */
function runCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing command: ${command}`);
                console.error(stderr);
                return reject(error);
            }
            resolve(stdout);
        });
    });
}

/**
 * Finds and lists processes with "Pixel Streaming" keywords in their command line.
 */
async function listPixelStreamingProcesses() {
    console.log('Searching for Pixel Streaming processes...');

    try {
        // Use wmic to get the process ID (PID) and command line for all processes.
        const wmicOutput = await runCommand('wmic process where "name IS NOT NULL" get ProcessId, CommandLine /format:list');

        // Split the output into individual processes.
        const processes = wmicOutput.split(/\n\s*\n/).filter(line => line.trim() !== '');

        let foundCount = 0;

        for (const processInfo of processes) {
            // Extract the ProcessId and CommandLine from the output.
            const pidMatch = processInfo.match(/ProcessId=(\d+)/);
            const cmdLineMatch = processInfo.match(/CommandLine=(.*)/);

            if (pidMatch && cmdLineMatch) {
                const pid = pidMatch[1];
                const commandLine = cmdLineMatch[1];

                // Check if the command line contains any of the specified keywords.
                const isPixelStreaming = PIXEL_STREAMING_KEYWORDS.some(keyword => commandLine.includes(keyword));

                if (isPixelStreaming) {
                    console.log(`\nFound a Pixel Streaming process!`);
                    console.log(`PID: ${pid}`);
                    console.log(`Command Line: ${commandLine}`);
                    foundCount++;
                }
            }
        }

        if (foundCount === 0) {
            console.log('\nNo Pixel Streaming processes found.');
        } else {
            console.log(`\nOperation complete. Found ${foundCount} processes.`);
        }

    } catch (err) {
        console.error('An error occurred while trying to list processes:', err);
    }
}

// Run the function.
listPixelStreamingProcesses();
