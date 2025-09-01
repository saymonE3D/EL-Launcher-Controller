const { exec } = require('child_process');

// Configuration - Update these to match your setup
const SERVER_URL = 'http://172.7.191.69:3000'; // Your server2.js URL
const PIXEL_STREAMING_KEYWORDS = [
    'PixelStreamingURL',
    'PixelStreamingPort', 
    'PixelStreamingID'
];

/**
 * Executes a shell command and returns stdout
 */
function runCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Command error: ${command}`);
                console.error(stderr);
                return reject(error);
            }
            resolve(stdout);
        });
    });
}

/**
 * Gets EL processes from the remote server
 */
async function getELProcesses() {
    try {
        // Try different ways to import fetch
        let fetch;
        try {
            fetch = require('node-fetch');
            if (fetch.default) fetch = fetch.default;
        } catch (e) {
            // Fallback to using curl command
            console.log('Using curl as fallback for HTTP request...');
            const curlOutput = await runCommand(`curl -s "${SERVER_URL}/api/processes"`);
            const data = JSON.parse(curlOutput);
            return data.processes || [];
        }
        
        const response = await fetch(`${SERVER_URL}/api/processes`);
        
        if (!response.ok) {
            throw new Error(`Server responded with status: ${response.status}`);
        }
        
        const data = await response.json();
        return data.processes || [];
    } catch (error) {
        console.error('Failed to fetch EL processes from server:', error.message);
        console.log('Attempting curl fallback...');
        
        try {
            const curlOutput = await runCommand(`curl -s "${SERVER_URL}/api/processes"`);
            const data = JSON.parse(curlOutput);
            console.log('✓ Successfully fetched via curl');
            return data.processes || [];
        } catch (curlError) {
            console.error('Curl fallback also failed:', curlError.message);
            console.log('\nTroubleshooting suggestions:');
            console.log('1. Check if your server is running: node server2.js');
            console.log('2. Verify server URL is correct:', SERVER_URL);
            console.log('3. Test manually: curl ' + SERVER_URL + '/api/processes');
            return [];
        }
    }
}

/**
 * Gets running Unreal Engine processes with Pixel Streaming
 */
async function getUnrealProcesses() {
    try {
        console.log('Scanning for Unreal Engine processes...');
        
        const wmicOutput = await runCommand('wmic process where "name IS NOT NULL" get ProcessId, CommandLine /format:list');
        const processes = wmicOutput.split(/\n\s*\n/).filter(line => line.trim() !== '');
        
        const unrealProcesses = [];
        
        for (const processInfo of processes) {
            const pidMatch = processInfo.match(/ProcessId=(\d+)/);
            const cmdLineMatch = processInfo.match(/CommandLine=(.*)/);
            
            if (pidMatch && cmdLineMatch) {
                const pid = parseInt(pidMatch[1]);
                const commandLine = cmdLineMatch[1];
                
                // Check if it's a Pixel Streaming process
                const isPixelStreaming = PIXEL_STREAMING_KEYWORDS.some(keyword => 
                    commandLine.includes(keyword)
                );
                
                if (isPixelStreaming) {
                    // Extract PixelStreamingID if present
                    const streamingIdMatch = commandLine.match(/-PixelStreamingID=\s*([^\s]+)/);
                    const streamingId = streamingIdMatch ? streamingIdMatch[1].trim() : 'Unknown';
                    
                    // Extract app executable name
                    const appMatch = commandLine.match(/([^\\\/]+\.exe)/);
                    const appName = appMatch ? appMatch[1] : 'Unknown';
                    
                    // Extract streaming URL port
                    const portMatch = commandLine.match(/ws:\/\/127\.0\.0\.1:(\d+)/);
                    const streamingPort = portMatch ? parseInt(portMatch[1]) : null;
                    
                    unrealProcesses.push({
                        pid,
                        appName,
                        streamingId,
                        streamingPort,
                        commandLine,
                        startTime: new Date() // We don't have exact start time from wmic
                    });
                }
            }
        }
        
        return unrealProcesses;
    } catch (error) {
        console.error('Failed to get Unreal processes:', error.message);
        return [];
    }
}

/**
 * Correlates EL processes with Unreal processes using improved matching
 */
function correlateProceses(elProcesses, unrealProcesses) {
    const correlations = [];
    
    if (elProcesses.length === 0 && unrealProcesses.length > 0) {
        console.log('\n⚠️  WARNING: Found Unreal processes but no EL processes from server.');
        console.log('   This could mean:');
        console.log('   - EL processes exist but server connection failed');
        console.log('   - Unreal apps were started manually (not via EL)');
        console.log('   - EL processes terminated but left Unreal apps running');
    }
    
    // Create a set to track which Unreal processes have been matched
    const matchedUnrealPids = new Set();
    
    // Sort EL processes by start time (earliest first)
    const sortedELProcesses = [...elProcesses].sort((a, b) => 
        new Date(a.startTime) - new Date(b.startTime)
    );
    
    // Sort Unreal processes by PID (assuming lower PID = started earlier)
    const sortedUnrealProcesses = [...unrealProcesses].sort((a, b) => a.pid - b.pid);
    
    console.log('\n🔍 MATCHING ANALYSIS:');
    console.log('EL Processes (by start time):');
    sortedELProcesses.forEach((el, i) => {
        console.log(`  ${i+1}. Iteration ${el.iteration}, PID ${el.pid}, Started: ${new Date(el.startTime).toLocaleTimeString()}`);
    });
    
    console.log('\nUnreal Processes (by PID):');
    sortedUnrealProcesses.forEach((unreal, i) => {
        console.log(`  ${i+1}. PID ${unreal.pid}, App: ${unreal.appName}, StreamingID: ${unreal.streamingId}`);
    });
    
    // Try different matching strategies
    sortedELProcesses.forEach(el => {
        let bestMatch = null;
        let matchReason = '';
        
        // Strategy 1: Try to find unmatched Unreal process closest in time
        const elStartTime = new Date(el.startTime);
        let closestByTime = null;
        let smallestTimeDiff = Infinity;
        
        for (const unreal of sortedUnrealProcesses) {
            if (matchedUnrealPids.has(unreal.pid)) continue; // Skip already matched
            
            // For timing, we'll use a more reasonable window
            // Assume Unreal app starts within 5 minutes of EL
            const timeDiff = Math.abs(Date.now() - elStartTime.getTime()); // Time since EL started
            
            if (timeDiff < smallestTimeDiff) {
                smallestTimeDiff = timeDiff;
                closestByTime = unreal;
            }
        }
        
        // Strategy 2: Try pattern matching on StreamingID
        for (const unreal of sortedUnrealProcesses) {
            if (matchedUnrealPids.has(unreal.pid)) continue;
            
            const streamingId = unreal.streamingId || '';
            
            // Look for EL iteration number in streaming ID
            if (streamingId.includes(el.iteration.toString())) {
                bestMatch = unreal;
                matchReason = `StreamingID contains iteration ${el.iteration}`;
                break;
            }
            
            // Look for EL PID in streaming ID  
            if (streamingId.includes(el.pid.toString())) {
                bestMatch = unreal;
                matchReason = `StreamingID contains EL PID ${el.pid}`;
                break;
            }
        }
        
        // Strategy 3: Sequential matching (first available EL -> first available Unreal)
        if (!bestMatch) {
            for (const unreal of sortedUnrealProcesses) {
                if (!matchedUnrealPids.has(unreal.pid)) {
                    bestMatch = unreal;
                    matchReason = `Sequential matching (EL ${el.iteration} -> first available Unreal)`;
                    break;
                }
            }
        }
        
        // Strategy 4: Time-based as last resort
        if (!bestMatch && closestByTime && smallestTimeDiff < 300000) { // 5 minutes
            bestMatch = closestByTime;
            matchReason = `Time proximity (${Math.round(smallestTimeDiff/1000)}s difference)`;
        }
        
        // Record the match
        const matchedProcesses = bestMatch ? [bestMatch] : [];
        if (bestMatch) {
            matchedUnrealPids.add(bestMatch.pid);
            console.log(`  ✓ EL ${el.iteration} (PID ${el.pid}) -> Unreal ${bestMatch.pid} (${bestMatch.appName}) - ${matchReason}`);
        } else {
            console.log(`  ❌ EL ${el.iteration} (PID ${el.pid}) -> No match found`);
        }
        
        correlations.push({
            elProcess: el,
            unrealProcesses: matchedProcesses,
            matchReason: matchReason,
            status: matchedProcesses.length > 0 ? 'MATCHED' : 'NO_UNREAL_APP'
        });
    });
    
    // Find orphaned Unreal processes
    const orphanedUnreal = sortedUnrealProcesses.filter(unreal => 
        !matchedUnrealPids.has(unreal.pid)
    );
    
    if (orphanedUnreal.length > 0) {
        console.log(`\n⚠️  ${orphanedUnreal.length} Unreal processes have no matching EL:`);
        orphanedUnreal.forEach(unreal => {
            console.log(`  - PID ${unreal.pid} (${unreal.appName})`);
        });
    }
    
    return { correlations, orphanedUnreal };
}

/**
 * Displays the tracking results in a formatted way
 */
function displayResults(results) {
    const { correlations, orphanedUnreal } = results;
    
    console.log('\n' + '='.repeat(80));
    console.log('EL-UNREAL PROCESS TRACKING REPORT');
    console.log('='.repeat(80));
    console.log(`Generated at: ${new Date().toLocaleString()}`);
    console.log(`Total EL Processes: ${correlations.length}`);
    console.log(`Total Unreal Processes: ${correlations.reduce((sum, c) => sum + c.unrealProcesses.length, 0) + orphanedUnreal.length}`);
    console.log('='.repeat(80));
    
    // Display EL-Unreal correlations
    correlations.forEach((correlation, index) => {
        const el = correlation.elProcess;
        console.log(`\n[${index + 1}] EL PROCESS (Iteration ${el.iteration})`);
        console.log(`    PID: ${el.pid}`);
        console.log(`    Status: ${el.connected ? 'Connected' : 'Running'}`);
        console.log(`    Start Time: ${new Date(el.startTime).toLocaleString()}`);
        console.log(`    Correlation Status: ${correlation.status}`);
        
        if (correlation.unrealProcesses.length > 0) {
            correlation.unrealProcesses.forEach((unreal, uIndex) => {
                console.log(`\n    → UNREAL APP ${uIndex + 1}:`);
                console.log(`        App PID: ${unreal.pid}`);
                console.log(`        App Name: ${unreal.appName}`);
                console.log(`        Streaming ID: ${unreal.streamingId}`);
                console.log(`        Streaming Port: ${unreal.streamingPort || 'N/A'}`);
                console.log(`        Match Reason: ${correlation.matchReason || 'Unknown'}`);
                console.log(`        Command: ${unreal.commandLine.substring(0, 100)}...`);
            });
        } else {
            console.log(`    → No Unreal app found for this EL process`);
        }
        
        console.log('-'.repeat(60));
    });
    
    // Display orphaned Unreal processes
    if (orphanedUnreal.length > 0) {
        console.log(`\n\nORPHANED UNREAL PROCESSES (No matching EL found):`);
        console.log('-'.repeat(60));
        
        orphanedUnreal.forEach((unreal, index) => {
            console.log(`\n[${index + 1}] ORPHANED UNREAL PROCESS`);
            console.log(`    App PID: ${unreal.pid}`);
            console.log(`    App Name: ${unreal.appName}`);
            console.log(`    Streaming ID: ${unreal.streamingId}`);
            console.log(`    Streaming Port: ${unreal.streamingPort || 'N/A'}`);
            console.log(`    Command: ${unreal.commandLine.substring(0, 100)}...`);
        });
    }
    
    console.log('\n' + '='.repeat(80));
}

/**
 * Main tracking function
 */
async function trackELUnrealProcesses() {
    try {
        console.log('Starting EL-Unreal Process Tracking...');
        console.log(`Connecting to server: ${SERVER_URL}`);
        
        // Test server connectivity first
        console.log('Testing server connectivity...');
        
        // Get data from both sources
        const [elProcesses, unrealProcesses] = await Promise.all([
            getELProcesses(),
            getUnrealProcesses()
        ]);
        
        console.log(`\nFound ${elProcesses.length} EL processes`);
        console.log(`Found ${unrealProcesses.length} Unreal processes`);
        
        // If we have Unreal processes but no EL processes, provide additional info
        if (unrealProcesses.length > 0 && elProcesses.length === 0) {
            console.log('\n📋 UNREAL PROCESS DETAILS (since no EL processes found):');
            unrealProcesses.forEach((unreal, index) => {
                console.log(`\n[${index + 1}] Unreal Process:`);
                console.log(`    PID: ${unreal.pid}`);
                console.log(`    App: ${unreal.appName}`);
                console.log(`    Streaming ID: ${unreal.streamingId}`);
                console.log(`    Port: ${unreal.streamingPort || 'N/A'}`);
            });
        }
        
        // Correlate the processes
        const results = correlateProceses(elProcesses, unrealProcesses);
        
        // Display results
        displayResults(results);
        
        return results;
        
    } catch (error) {
        console.error('Tracking failed:', error.message);
        console.error('Full error:', error);
        process.exit(1);
    }
}

/**
 * Run tracking with optional continuous monitoring
 */
async function main() {
    const args = process.argv.slice(2);
    const continuousMode = args.includes('--continuous') || args.includes('-c');
    const interval = args.includes('--interval') ? 
        parseInt(args[args.indexOf('--interval') + 1]) || 30 : 30;
    
    if (continuousMode) {
        console.log(`Starting continuous tracking (every ${interval} seconds)`);
        console.log('Press Ctrl+C to stop...');
        
        // Run immediately first
        await trackELUnrealProcesses();
        
        // Then run at intervals
        setInterval(async () => {
            console.log('\n\n' + '='.repeat(20) + ' REFRESHING ' + '='.repeat(20));
            await trackELUnrealProcesses();
        }, interval * 1000);
        
    } else {
        await trackELUnrealProcesses();
        console.log('\nTracking complete. Use --continuous flag for live monitoring.');
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\nTracking stopped by user.');
    process.exit(0);
});

// Install node-fetch if not present and try to fix import issues
try {
    require('node-fetch');
} catch (e) {
    console.log('Installing node-fetch...');
    try {
        require('child_process').execSync('npm install node-fetch', { stdio: 'inherit' });
        console.log('✓ node-fetch installed successfully');
    } catch (installError) {
        console.log('❌ Failed to install node-fetch, will use curl fallback');
    }
}

// Run the tracker
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { trackELUnrealProcesses, getELProcesses, getUnrealProcesses }