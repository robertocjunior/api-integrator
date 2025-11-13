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
 * Processa Requisição HTTP
 */
export async function processRequestStep(step, context) {
    const isBodyEnabled = step.bodyEnabled !== false; 
    let dataPayload = null;
    if (isBodyEnabled && step.body && Object.keys(step.body).length > 0) {
        dataPayload = step.body;
    }

    const config = resolveVariables({
        method: step.method,
        url: step.url,
        headers: step.headers || {},
        data: dataPayload
    }, context);

    if (config.method === 'GET' || config.method === 'HEAD') {
        delete config.data;
    }

    const timeoutMs = parseInt(step.timeout) || 30000;
    const response = await axios({ ...config, timeout: timeoutMs });

    if (step.extracts && Array.isArray(step.extracts)) {
        step.extracts.forEach(ext => {
            const rawVal = _.get(response.data, ext.path);
            if (ext.isList) {
                if (Array.isArray(rawVal)) {
                    context[ext.variableName] = rawVal;
                } else {
                    const arrayPathMatch = ext.path.match(/^(.*)\[\d+\](\..+)?$/);
                    if (arrayPathMatch) {
                        const rootArray = _.get(response.data, arrayPathMatch[1]);
                        const prop = arrayPathMatch[2] ? arrayPathMatch[2].substring(1) : null;
                        if (Array.isArray(rootArray)) {
                            context[ext.variableName] = prop ? rootArray.map(i => _.get(i, prop)) : rootArray;
                        } else {
                            context[ext.variableName] = [rawVal];
                        }
                    } else {
                        context[ext.variableName] = [rawVal];
                    }
                }
            } else {
                if (rawVal !== undefined) context[ext.variableName] = rawVal;
            }
        });
    }
    return response;
}

/**
 * Processa Manipulação de Dados
 */
export function processManipulationStep(step, context) {
    if (!step.operations || !Array.isArray(step.operations)) return;

    step.operations.forEach(op => {
        try {
            // 1. Resolve o valor de entrada (ex: "{{NOME}}")
            let inputVal = resolveVariables(op.input, context);
            let result = inputVal;

            // Se o input for um Array (extraído como lista), aplicamos a operação em CADA item
            // Caso contrário, aplicamos no valor único
            const isArrayInput = Array.isArray(inputVal);
            const applyOp = (val) => {
                let processed = val;
                
                switch (op.type) {
                    case 'replace':
                        if (typeof processed === 'string') {
                            // Replace simples (case sensitive)
                            processed = processed.split(op.find).join(op.replace || '');
                        }
                        break;
                    
                    case 'map':
                        // De/Para (ex: "true" -> "S")
                        // Converte para string para garantir chaveamento
                        const key = String(processed);
                        if (op.map && op.map[key] !== undefined) {
                            processed = op.map[key];
                        } else if (op.mapDefault !== undefined && op.mapDefault !== '') {
                            processed = op.mapDefault;
                        }
                        break;

                    case 'format':
                        if (typeof processed === 'string') {
                            if (op.formatType === 'upper') processed = processed.toUpperCase();
                            if (op.formatType === 'lower') processed = processed.toLowerCase();
                            if (op.formatType === 'trim') processed = processed.trim();
                            if (op.formatType === 'number') processed = parseFloat(processed) || 0;
                        }
                        break;

                    case 'math':
                        // Cuidado com eval, mas útil para contas simples
                        // Remove caracteres perigosos, aceita apenas numeros e operadores
                        try {
                            // Tenta converter para numero primeiro
                            const num = parseFloat(processed);
                            if (!isNaN(num)) {
                                // Ex: input é 100. Formula: "x * 2"
                                // Substituimos 'x' pelo valor
                                const formula = op.formula.toLowerCase().replace(/x/g, num);
                                // Validação simples de segurança
                                if (/^[\d\.\s\+\-\*\/\(\)]+$/.test(formula)) {
                                    processed = eval(formula);
                                }
                            }
                        } catch(e) {}
                        break;
                    
                    case 'template':
                    default:
                        // Template já é resolvido pelo resolveVariables no início
                        break;
                }
                return processed;
            };

            if (isArrayInput) {
                result = inputVal.map(item => applyOp(item));
            } else {
                result = applyOp(inputVal);
            }

            // Salva no contexto
            if (op.outputVar) {
                context[op.outputVar.toUpperCase()] = result;
            }

        } catch (err) {
            console.error(`Erro na manipulação [${op.type}]:`, err.message);
        }
    });
}

/**
 * Executa Fluxo
 */
export async function executeFlow(flow, io) {
    const context = {}; 
    const logPrefix = `[${flow.name}]`;
    
    io.emit('flow-status', { id: flow.id, status: 'running', step: 'start' });

    try {
        for (const step of flow.steps) {
            io.emit('flow-status', { id: flow.id, status: 'running', step: step.id });

            if (step.type === 'request') {
                await processRequestStep(step, context);
            } 
            else if (step.type === 'wait') {
                const ms = parseInt(step.delay) || 1000;
                await new Promise(resolve => setTimeout(resolve, ms));
            }
            // --- MANIPULATION ---
            else if (step.type === 'manipulation') {
                processManipulationStep(step, context);
            }
            // --- SANKHYA ---
            else if (step.type === 'sankhya') {
                // ... (Código Sankhya mantido igual ao anterior) ...
                if (step.operation === 'insert') {
                    const rawMapping = step.mapping;
                    const finalRecords = [];
                    let maxRows = 1;
                    const evaluatedMapping = {};
                    
                    for (const key in rawMapping) {
                        const valPattern = rawMapping[key];
                        const match = typeof valPattern === 'string' ? valPattern.match(/^\{\{([\w_]+)\}\}$/) : null;
                        
                        if (match) {
                            const varName = match[1];
                            const ctxVal = context[varName];
                            if (Array.isArray(ctxVal)) {
                                evaluatedMapping[key] = ctxVal;
                                if (ctxVal.length > maxRows) maxRows = ctxVal.length;
                            } else {
                                evaluatedMapping[key] = ctxVal;
                            }
                        } else {
                            evaluatedMapping[key] = resolveVariables(valPattern, context);
                        }
                    }

                    const orderedFields = Object.keys(rawMapping);
                    for (let i = 0; i < maxRows; i++) {
                        const recordValues = {};
                        orderedFields.forEach((fieldName, idx) => {
                            const valOrArray = evaluatedMapping[fieldName];
                            let finalVal;
                            if (Array.isArray(valOrArray)) {
                                finalVal = valOrArray[i] !== undefined ? valOrArray[i] : (valOrArray.length === 1 ? valOrArray[0] : null);
                            } else {
                                finalVal = valOrArray;
                            }
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
                    await executeSankhyaRequest('DatasetSP.save', requestBody);
                } else if (step.operation === 'select') {
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