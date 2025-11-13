import axios from 'axios';
import { loadFlowsFromFile, saveFlowsToFile, restartScheduler } from '../engine/scheduler.js';
import { getSankhyaConfig, saveSankhyaConfig, getTableMetadata } from '../services/sankhyaService.js';
import { resolveVariables } from '../engine/executor.js';

export const getFlows = (req, res) => {
    const flows = loadFlowsFromFile();
    res.json(flows);
};

export const saveFlows = (req, res) => {
    const flows = req.body;
    saveFlowsToFile(flows);
    
    const io = req.app.get('io');
    restartScheduler(flows, io);
    
    res.json({ success: true });
};

// Proxy de Teste
export const testStep = async (req, res) => {
    try {
        const { method, url, headers, body, contextMock } = req.body;
        
        // Resolver variáveis com mock
        const resolvedConfig = resolveVariables({ 
            method, 
            url, 
            headers, 
            data: body // CORREÇÃO: Mapeando body -> data para o Axios
        }, contextMock || {});

        const response = await axios({ ...resolvedConfig, timeout: 10000 });
        
        res.json({
            status: response.status,
            data: response.data,
            headers: response.headers
        });
    } catch (error) {
        res.status(error.response?.status || 500).json({
            error: error.message,
            data: error.response?.data
        });
    }
};

export const getErpConfig = (req, res) => {
    res.json(getSankhyaConfig());
};

export const saveErpConfig = (req, res) => {
    saveSankhyaConfig(req.body);
    res.json({ success: true });
};

// Metadados (Colunas)
export const getTableColumns = async (req, res) => {
    try {
        const { tableName } = req.query;
        const columns = await getTableMetadata(tableName);
        res.json(columns);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};