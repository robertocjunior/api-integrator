import axios from 'axios';
import _ from 'lodash';
import { executeSankhyaRequest } from '../services/sankhyaService.js'; // IMPORTAR

// ... (função resolveVariables mantida igual) ...
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

export async function executeFlow(flow, io) {
    const context = {}; 
    const logPrefix = `[${flow.name}]`;
    
    console.log(`${logPrefix} Iniciando...`);
    io.emit('flow-status', { id: flow.id, status: 'running', step: 'start' });

    try {
        for (const step of flow.steps) {
            io.emit('flow-status', { id: flow.id, status: 'running', step: step.id });

            if (step.type === 'request') {
                // ... (Lógica existente de request) ...
                // Copie a lógica anterior aqui para manter funcionando
                 const config = resolveVariables({
                    method: step.method,
                    url: step.url,
                    headers: step.headers || {},
                    data: step.body || null
                }, context);
                const response = await axios({ ...config, timeout: 30000 });
                if (step.extracts && Array.isArray(step.extracts)) {
                    step.extracts.forEach(ext => {
                        const val = _.get(response.data, ext.path);
                        if (val !== undefined) context[ext.variableName] = val;
                    });
                }
            } 
            else if (step.type === 'wait') {
                const ms = parseInt(step.delay) || 1000;
                await new Promise(resolve => setTimeout(resolve, ms));
            }
            // --- NOVO BLOCO: SANKHYA ---
            else if (step.type === 'sankhya') {
                console.log(`${logPrefix} Executando Sankhya: ${step.operation}`);
                
                if (step.operation === 'insert') {
                    // 1. Resolver as variáveis no mapeamento
                    const resolvedMapping = resolveVariables(step.mapping, context);
                    
                    // 2. Preparar vetores para o DatasetSP.save
                    // O Sankhya exige: fields: ["NOME", "IDADE"] e values: {"0": "Joao", "1": "30"}
                    const fieldNames = Object.keys(resolvedMapping);
                    const valuesObj = {};
                    
                    fieldNames.forEach((fieldName, index) => {
                        valuesObj[index.toString()] = resolvedMapping[fieldName];
                    });

                    const requestBody = {
                        dataSetID: step.datasetId, // Ex: "01S"
                        entityName: step.tableName, // Ex: "AD_LOCATCAR"
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
                }
            }
        }

        io.emit('flow-status', { id: flow.id, status: 'idle', lastRun: new Date() });

    } catch (error) {
        console.error(`${logPrefix} Erro: ${error.message}`);
        io.emit('flow-status', { id: flow.id, status: 'error', error: error.message });
    }
}