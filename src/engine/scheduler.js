import fs from 'fs';
import { executeFlow } from './executor.js';

const FLOWS_FILE = 'flows.json';
let activeFlows = [];
let runningJobs = {};

// Carrega fluxos do disco
export function loadFlowsFromFile() {
    if (fs.existsSync(FLOWS_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(FLOWS_FILE));
        } catch (e) {
            console.error("Erro ao ler flows.json", e);
            return [];
        }
    }
    return [];
}

export function saveFlowsToFile(flows) {
    fs.writeFileSync(FLOWS_FILE, JSON.stringify(flows, null, 2));
}

// Para um job específico
function stopJob(flowId) {
    if (runningJobs[flowId]) {
        clearTimeout(runningJobs[flowId]);
        delete runningJobs[flowId];
    }
}

// Agenda um job
function scheduleJob(flow, io) {
    if (!flow.enabled) return;
    
    const run = async () => {
        await executeFlow(flow, io);
        // Reagendar recursivamente
        runningJobs[flow.id] = setTimeout(run, flow.interval || 60000);
    };
    
    // Delay inicial aleatório para não encavalar tudo no start
    runningJobs[flow.id] = setTimeout(run, 2000);
}

// Reinicia todo o sistema (chamado ao salvar)
export function restartScheduler(flows, io) {
    Object.keys(runningJobs).forEach(stopJob);
    activeFlows = flows;
    activeFlows.forEach(flow => scheduleJob(flow, io));
}

// Inicialização
export function initScheduler(io) {
    activeFlows = loadFlowsFromFile();
    restartScheduler(activeFlows, io);
}