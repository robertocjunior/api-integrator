import axios from 'axios';
import _ from 'lodash';

/**
 * Substitui {{VARIAVEL}} pelo valor real do contexto
 */
export function resolveVariables(target, context) {
    if (typeof target === 'string') {
        return target.replace(/\{\{([\w_]+)\}\}/g, (_, key) => {
            return context[key] !== undefined ? context[key] : `{{${key}}}`;
        });
    }
    if (Array.isArray(target)) {
        return target.map(item => resolveVariables(item, context));
    }
    if (typeof target === 'object' && target !== null) {
        const result = {};
        for (const key in target) {
            result[key] = resolveVariables(target[key], context);
        }
        return result;
    }
    return target;
}

/**
 * Executa um único fluxo passo a passo
 */
export async function executeFlow(flow, io) {
    const context = {}; 
    const logPrefix = `[${flow.name}]`;
    
    console.log(`${logPrefix} Iniciando...`);
    io.emit('flow-status', { id: flow.id, status: 'running', step: 'start' });

    try {
        for (const step of flow.steps) {
            io.emit('flow-status', { id: flow.id, status: 'running', step: step.id });

            if (step.type === 'request') {
                // 1. Resolver Variáveis
                const config = resolveVariables({
                    method: step.method,
                    url: step.url,
                    headers: step.headers || {},
                    data: step.body || null
                }, context);

                // 2. Request
                const response = await axios({ ...config, timeout: 30000 });
                
                // 3. Extrair Variáveis
                if (step.extracts && Array.isArray(step.extracts)) {
                    step.extracts.forEach(ext => {
                        const val = _.get(response.data, ext.path);
                        if (val !== undefined) {
                            context[ext.variableName] = val;
                        }
                    });
                }
            } 
            else if (step.type === 'wait') {
                const ms = parseInt(step.delay) || 1000;
                await new Promise(resolve => setTimeout(resolve, ms));
            }
        }

        io.emit('flow-status', { id: flow.id, status: 'idle', lastRun: new Date() });

    } catch (error) {
        console.error(`${logPrefix} Erro: ${error.message}`);
        io.emit('flow-status', { id: flow.id, status: 'error', error: error.message });
    }
}