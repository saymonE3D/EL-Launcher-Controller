const {launchExeWithArgs}=require('../AppExeUtilities')
const CONFIG = require('../config/config');
// Process state
let activeProcesses = [];
let isLaunching = false;
let currentLaunchStatus = {
    total: 0,
    completed: 0,
    running: false,
    startIteration: 1
};
// Check if connection is successful
const isConnectionSuccessful = (output) => {
    return CONFIG.CONNECTION_MESSAGES.some(msg => output.includes(msg));
}
const createCallBack=(iteration, totalIteration, startIteration)=>({
    onData: (data) => {
        const output = data.toString();
        if (isConnectionSuccessful(output)) {
            const process = activeProcesses.find(p => p.iteration === iteration);
            if (process) {
                process.status = 'connected';
                process.connected = true;
            }
            currentLaunchStatus.completed++;
            
            if (iteration === (startIteration + totalIteration - 1)) {
                setTimeout(() => {
                    isLaunching = false;
                    currentLaunchStatus.running = false;
                }, CONFIG.CONNECTION_TIMEOUT);
            }
        }
    },
    onErrorData: () => {},
    onClose: () => {},
    onExit: () => {},
    onError: () => {}
})
// Launch single iteration
const launchIteration = async (iteration, totalIteration, startIteration) => {
    if (iteration > (startIteration + totalIteration - 1)) return;
    
    try {
        const callback = createCallback(iteration, totalIteration, startIteration);
        const elProcess = launchExeWithArgs(CONFIG.EXE_PATH, [], callback);
        
        activeProcesses.push({
            iteration,
            process: elProcess,
            pid: elProcess.pid,
            status: 'running',
            connected: false,
            startTime: new Date().toISOString()
        });
        
        setTimeout(() => {
            launchIteration(iteration + 1, totalIteration, startIteration);
        }, CONFIG.LAUNCH_DELAY);
        
    } catch (error) {
        setTimeout(() => {
            launchIteration(iteration + 1, totalIteration, startIteration);
        }, CONFIG.LAUNCH_DELAY);
    }
};
// Start launch process
const startLaunch = async (iterations) => {
    if (isLaunching) {
        throw new Error('Launch already in progress');
    }
    
    if (!iterations || iterations < 1) {
        throw new Error('Invalid iteration count');
    }
    
    const nextIteration = activeProcesses.length > 0 ? 
        Math.max(...activeProcesses.map(p => p.iteration)) + 1 : 1;
    
    isLaunching = true;
    currentLaunchStatus = {
        total: iterations,
        completed: 0,
        running: true,
        startIteration: nextIteration
    };
    
    try {
        launchIteration(nextIteration, iterations, nextIteration);
        return {
            message: 'Launch started',
            iterations,
            startIteration: nextIteration,
            totalProcesses: activeProcesses.length + iterations
        };
    } catch (error) {
        isLaunching = false;
        currentLaunchStatus.running = false;
        throw error;
    }
};
// Get all processes info
const getProcesses = () => ({
    processes: activeProcesses.map(p => ({
        iteration: p.iteration,
        pid: p.pid,
        status: p.status,
        connected: p.connected,
        startTime: p.startTime
    })),
    isLaunching,
    launchStatus: currentLaunchStatus,
    totalProcesses: activeProcesses.length
});

// Terminate single process
const terminateProcess = (pid) => {
    const processIndex = activeProcesses.findIndex(p => p.pid === pid);
    
    if (processIndex === -1) {
        throw new Error('Process not found');
    }
    
    const process = activeProcesses[processIndex];
    process.process.kill('SIGTERM');
    activeProcesses.splice(processIndex, 1);
    
    return { message: 'Process terminated' };
};

// Terminate all processes
const terminateAllProcesses = () => {
    let terminatedCount = 0;
    
    activeProcesses.forEach(processInfo => {
        try {
            processInfo.process.kill('SIGTERM');
            terminatedCount++;
        } catch (error) {
            console.error(`Failed to terminate process ${processInfo.pid}:`, error);
        }
    });
    
    activeProcesses = [];
    isLaunching = false;
    currentLaunchStatus = {
        total: 0,
        completed: 0,
        running: false,
        startIteration: 1
    };
    
    return { message: 'All processes terminated', terminatedCount };
};

// Get current status
const getStatus = () => currentLaunchStatus;

module.exports = {
    startLaunch,
    getProcesses,
    terminateProcess,
    terminateAllProcesses,
    getStatus
};