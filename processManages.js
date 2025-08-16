const { launchExeWithArgs } = require('./AppExeUtilities');

class ProcessManager {
    constructor() {
        this.activeProcesses = [];
        this.isLaunching = false;
        this.currentLaunchStatus = {
            total: 0,
            completed: 0,
            running: false,
            startIteration: 1
        };
    }

    isConnectionSuccessful(output) {
        return output.includes('ioClient4MMLineker--> Exeluncher message recieved') ||
               output.includes('you are conneted to MMLineker.js as exeluncher') ||
               output.includes('Exeluncher connected to MMLineker');
    }

    createCallback(iteration, totalIteration, startIteration) {
        return {
            onData: (data) => {
                const output = data.toString();
                if (this.isConnectionSuccessful(output)) {
                    const process = this.activeProcesses.find(p => p.iteration === iteration);
                    if (process) {
                        process.status = 'connected';
                        process.connected = true;
                    }
                    this.currentLaunchStatus.completed++;
                    
                    if (iteration === (startIteration + totalIteration - 1)) {
                        setTimeout(() => {
                            this.isLaunching = false;
                            this.currentLaunchStatus.running = false;
                        }, 2000);
                    }
                }
            },
            onErrorData: (data) => {},
            onClose: ({ code, signal }) => {},
            onExit: ({ code, signal }) => {},
            onError: (error) => {}
        };
    }

    async launchIteration(iteration, totalIteration, startIteration) {
        if (iteration > (startIteration + totalIteration - 1)) {
            return;
        }
        
        try {
            const exePath = 'C:\\Users\\HP\\Desktop\\E3DSOffice\\NodeApp\\EL.exe';
            const callback = this.createCallback(iteration, totalIteration, startIteration);
            const elProcess = launchExeWithArgs(exePath, [], callback);
            
            this.activeProcesses.push({
                iteration: iteration,
                process: elProcess,
                pid: elProcess.pid,
                status: 'running',
                connected: false,
                startTime: new Date().toISOString()
            });
            
            setTimeout(() => {
                this.launchIteration(iteration + 1, totalIteration, startIteration);
            }, 60000);
            
        } catch (error) {
            setTimeout(() => {
                this.launchIteration(iteration + 1, totalIteration, startIteration);
            }, 60000);
        }
    }

    async startLaunch(iterations) {
        if (this.isLaunching) {
            throw new Error('Launch already in progress');
        }
        
        if (!iterations || iterations < 1) {
            throw new Error('Invalid iteration count');
        }
        
        const nextIteration = this.activeProcesses.length > 0 ? 
            Math.max(...this.activeProcesses.map(p => p.iteration)) + 1 : 1;
        
        this.isLaunching = true;
        this.currentLaunchStatus = {
            total: iterations,
            completed: 0,
            running: true,
            startIteration: nextIteration
        };
        
        try {
            await this.launchIteration(nextIteration, iterations, nextIteration);
            return {
                message: 'Launch started',
                iterations,
                startIteration: nextIteration,
                totalProcesses: this.activeProcesses.length + iterations
            };
        } catch (error) {
            this.isLaunching = false;
            this.currentLaunchStatus.running = false;
            throw error;
        }
    }

    getProcesses() {
        return {
            processes: this.activeProcesses.map(p => ({
                iteration: p.iteration,
                pid: p.pid,
                status: p.status,
                connected: p.connected,
                startTime: p.startTime
            })),
            isLaunching: this.isLaunching,
            launchStatus: this.currentLaunchStatus,
            totalProcesses: this.activeProcesses.length
        };
    }

    terminateProcess(pid) {
        const processIndex = this.activeProcesses.findIndex(p => p.pid === pid);
        
        if (processIndex === -1) {
            throw new Error('Process not found');
        }
        
        try {
            const process = this.activeProcesses[processIndex];
            process.process.kill('SIGTERM');
            this.activeProcesses.splice(processIndex, 1);
            return { message: 'Process terminated' };
        } catch (error) {
            throw new Error('Failed to terminate process');
        }
    }

    terminateAllProcesses() {
        try {
            let terminatedCount = 0;
            
            this.activeProcesses.forEach(processInfo => {
                try {
                    processInfo.process.kill('SIGTERM');
                    terminatedCount++;
                } catch (error) {
                    console.error(`Failed to terminate process ${processInfo.pid}:`, error);
                }
            });
            
            this.activeProcesses = [];
            this.isLaunching = false;
            this.currentLaunchStatus = {
                total: 0,
                completed: 0,
                running: false,
                startIteration: 1
            };
            
            return {
                message: 'All processes terminated',
                terminatedCount
            };
        } catch (error) {
            throw new Error('Failed to terminate all processes');
        }
    }

    getStatus() {
        return this.currentLaunchStatus;
    }
}

module.exports = ProcessManager;