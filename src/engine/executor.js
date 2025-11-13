import axios from 'axios';
import _ from 'lodash';
import { executeSankhyaRequest } from '../services/sankhyaService.js';

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
 * Processa um único passo de REQUEST.
 * Usado tanto pelo Job Scheduler quanto pelo Testador na API.
 */
export async function processRequestStep(step, context) {
    // 1. Prepara o Body (se vazio, define null para não quebrar GETs)
    let dataPayload = null;
    if (step.body && Object.keys(step.body).length > 0) {
        dataPayload = step.body;
    }

    // 2. Resolve variáveis
    const config = resolveVariables({
        method: step.method,
        url: step.url,
        headers: step.headers || {},
        data: dataPayload
    }, context);

    // 3. Limpeza específica para Axios (GET não deve ter 'data')
    if (config.method === 'GET' || config.method === 'HEAD') {
        delete config.data;
    }

    // 4. Timeout configurável (padrão 30s)
    const timeoutMs = parseInt(step.timeout) || 30000;

    // 5. Executa
    const response = await axios({ ...config, timeout: timeoutMs });

    // 6. Extração de Variáveis (Marca Texto)
    if (step.extracts && Array.isArray(step.extracts)) {
        step.extracts.forEach(ext => {
            const val = _.get(response.data, ext.path);
            if (val !== undefined) {
                context[ext.variableName] = val;
            }
        });
    }

    return response;
}

/**
 * Executa um fluxo completo (Loop do Job Agendado)
 */
export async function executeFlow(flow, io) {
    const context = {}; 
    const logPrefix = `[${flow.name}]`;
    
    console.log(`${logPrefix} Iniciando ciclo...`);
    io.emit('flow-status', { id: flow.id, status: 'running', step: 'start' });

    try {
        for (const step of flow.steps) {
            io.emit('flow-status', { id: flow.id, status: 'running', step: step.id });

            // --- TIPO: REQUEST ---
            if (step.type === 'request') {
                await processRequestStep(step, context);
            } 
            
            // --- TIPO: WAIT ---
            else if (step.type === 'wait') {
                const ms = parseInt(step.delay) || 1000;
                await new Promise(resolve => setTimeout(resolve, ms));
            }

            // --- TIPO: SANKHYA ---
            else if (step.type === 'sankhya') {
                
                if (step.operation === 'insert') {
                    const resolvedMapping = resolveVariables(step.mapping, context);
                    
                    // Prepara vetores para o Sankhya (fields vs values)
                    const fieldNames = Object.keys(resolvedMapping);
                    const valuesObj = {};
                    
                    fieldNames.forEach((fieldName, index) => {
                        valuesObj[index.toString()] = resolvedMapping[fieldName];
                    });

                    const requestBody = {
                        dataSetID: step.datasetId,
                        entityName: step.tableName,
                        standAlone: false,
                        fields: fieldNames,
                        records: [{ values: valuesObj }]
                    };

                    await executeSankhyaRequest('DatasetSP.save', requestBody);
                }
                else if (step.operation === 'select') {
                    const resolvedSql = resolveVariables(step.sql, context);
                    await executeSankhyaRequest('DbExplorerSP.executeQuery', {
                        sql: resolvedSql,
                        params: {}
                    });
                    // TODO: Adicionar extração de variáveis do Select Sankhya futuramente
                }
            }
        }

        io.emit('flow-status', { id: flow.id, status: 'idle', lastRun: new Date() });

    } catch (error) {
        const errMsg = error.response?.data ? JSON.stringify(error.response.data) : error.message;
        console.error(`${logPrefix} Erro: ${errMsg}`);
        io.emit('flow-status', { id: flow.id, status: 'error', error: errMsg });
    }
}