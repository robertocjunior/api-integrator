import axios from 'axios';
import _ from 'lodash';
import { executeSankhyaRequest } from '../services/sankhyaService.js';

/**
 * Substitui {{VARIAVEL}} pelo valor real do contexto
 */
export function resolveVariables(target, context) {
    if (typeof target === 'string') {
        return target.replace(/\{\{([\w_]+)\}\}/g, (_, key) => {
            // Se o valor no contexto for undefined, mantém a tag {{VAR}}
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
 * Suporta extração de listas (Arrays) para uso em Batch.
 */
export async function processRequestStep(step, context) {
    // 1. Verifica se o Body está HABILITADO
    const isBodyEnabled = step.bodyEnabled !== false; 
    let dataPayload = null;
    if (isBodyEnabled && step.body && Object.keys(step.body).length > 0) {
        dataPayload = step.body;
    }

    // 2. Resolve variáveis
    const config = resolveVariables({
        method: step.method,
        url: step.url,
        headers: step.headers || {},
        data: dataPayload
    }, context);

    // 3. Limpeza para GET
    if (config.method === 'GET' || config.method === 'HEAD') {
        delete config.data;
    }

    // 4. Timeout
    const timeoutMs = parseInt(step.timeout) || 30000;

    // 5. Executa
    const response = await axios({ ...config, timeout: timeoutMs });

    // 6. Extração de Variáveis (com suporte a Listas)
    if (step.extracts && Array.isArray(step.extracts)) {
        step.extracts.forEach(ext => {
            const rawVal = _.get(response.data, ext.path);
            
            // Lógica de Lista (Array)
            if (ext.isList) {
                // Se o valor extraído já é um array, salva direto
                if (Array.isArray(rawVal)) {
                    context[ext.variableName] = rawVal;
                } else {
                    // Se pegou um item solto (ex: data[0].id), tenta descobrir o array pai
                    const arrayPathMatch = ext.path.match(/^(.*)\[\d+\](\..+)?$/);
                    
                    if (arrayPathMatch) {
                        const rootArrayPath = arrayPathMatch[1]; // ex: "posicoes"
                        const itemPropPath = arrayPathMatch[2] ? arrayPathMatch[2].substring(1) : null; // ex: "cveiPlaca"
                        
                        const rootArray = _.get(response.data, rootArrayPath);
                        
                        if (Array.isArray(rootArray)) {
                            if (itemPropPath) {
                                // Mapeia a propriedade de cada item (ex: todas as placas)
                                context[ext.variableName] = rootArray.map(item => _.get(item, itemPropPath));
                            } else {
                                // Array de primitivos
                                context[ext.variableName] = rootArray; 
                            }
                        } else {
                            // Fallback: salva como array de 1 item se falhar a detecção
                            context[ext.variableName] = [rawVal];
                        }
                    } else {
                        context[ext.variableName] = [rawVal];
                    }
                }
            } else {
                // Valor Simples
                if (rawVal !== undefined) {
                    context[ext.variableName] = rawVal;
                }
            }
        });
    }

    return response;
}

/**
 * Executa um fluxo completo
 */
export async function executeFlow(flow, io) {
    const context = {}; 
    const logPrefix = `[${flow.name}]`;
    
    io.emit('flow-status', { id: flow.id, status: 'running', step: 'start' });

    try {
        for (const step of flow.steps) {
            io.emit('flow-status', { id: flow.id, status: 'running', step: step.id });

            // --- REQUEST ---
            if (step.type === 'request') {
                await processRequestStep(step, context);
            } 
            
            // --- WAIT ---
            else if (step.type === 'wait') {
                const ms = parseInt(step.delay) || 1000;
                await new Promise(resolve => setTimeout(resolve, ms));
            }

            // --- SANKHYA (INSERT/SELECT) ---
            else if (step.type === 'sankhya') {
                
                if (step.operation === 'insert') {
                    const rawMapping = step.mapping;
                    const finalRecords = [];
                    let maxRows = 1;

                    // 1. Avaliar Mapeamento e Detectar Arrays
                    const evaluatedMapping = {};
                    
                    for (const key in rawMapping) {
                        const valPattern = rawMapping[key];
                        
                        // Verifica se é variável pura: "{{VAR}}"
                        const match = typeof valPattern === 'string' ? valPattern.match(/^\{\{([\w_]+)\}\}$/) : null;
                        
                        if (match) {
                            const varName = match[1];
                            const ctxVal = context[varName];
                            
                            if (Array.isArray(ctxVal)) {
                                evaluatedMapping[key] = ctxVal; // É uma lista de valores
                                if (ctxVal.length > maxRows) maxRows = ctxVal.length;
                            } else {
                                evaluatedMapping[key] = ctxVal; // Valor único
                            }
                        } else {
                            // Resolve variáveis dentro de string (ex: "Fixo {{VAR}}")
                            evaluatedMapping[key] = resolveVariables(valPattern, context);
                        }
                    }

                    // 2. Pivotar Dados (Transformar colunas de arrays em linhas de registros)
                    const orderedFields = Object.keys(rawMapping);

                    for (let i = 0; i < maxRows; i++) {
                        const recordValues = {};
                        
                        orderedFields.forEach((fieldName, idx) => {
                            const valOrArray = evaluatedMapping[fieldName];
                            let finalVal;

                            if (Array.isArray(valOrArray)) {
                                // Pega o item do índice atual, ou o último (se array menor), ou null
                                finalVal = valOrArray[i] !== undefined ? valOrArray[i] : (valOrArray.length === 1 ? valOrArray[0] : null);
                            } else {
                                finalVal = valOrArray;
                            }
                            
                            // O Sankhya espera chaves como string numérica ("0", "1", "2") baseada na ordem dos fields
                            recordValues[idx.toString()] = finalVal;
                        });

                        finalRecords.push({ values: recordValues });
                    }

                    const requestBody = {
                        dataSetID: step.datasetId,
                        entityName: step.tableName,
                        standAlone: false,
                        fields: orderedFields,
                        records: finalRecords
                    };

                    console.log(`${logPrefix} Inserindo ${finalRecords.length} registros no Sankhya...`);
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
        const errMsg = error.response?.data ? JSON.stringify(error.response.data) : error.message;
        console.error(`${logPrefix} Erro: ${errMsg}`);
        io.emit('flow-status', { id: flow.id, status: 'error', error: errMsg });
    }
}