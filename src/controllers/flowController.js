import axios from 'axios';
import _ from 'lodash';
import { loadFlowsFromFile, saveFlowsToFile, restartScheduler } from '../engine/scheduler.js';
import { getSankhyaConfig, saveSankhyaConfig, getTableMetadata, executeSankhyaRequest } from '../services/sankhyaService.js';
import { processRequestStep, resolveVariables } from '../engine/executor.js';

// --- CRUD DE FLUXOS ---

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

// --- TESTE SEQUENCIAL INTELIGENTE ---
// Executa o fluxo do início até o passo alvo para garantir que o contexto exista.
export const testStep = async (req, res) => {
    try {
        const { flow, targetStepId } = req.body;
        const context = {}; // Contexto volátil apenas para o teste
        let targetResponse = null;
        let found = false;

        console.log(`[Teste] Iniciando simulação de fluxo para testar passo: ${targetStepId}`);

        for (const step of flow.steps) {
            // Se já passou do alvo, para.
            if (found) break;

            try {
                // 1. Executa REQUEST
                if (step.type === 'request') {
                    // Se é o alvo, executamos e capturamos a resposta final
                    if (step.id === targetStepId) {
                        const response = await processRequestStep(step, context);
                        targetResponse = {
                            status: response.status,
                            data: response.data,
                            headers: response.headers
                        };
                        found = true;
                    } 
                    // Se é passo anterior, executamos apenas para popular o context (tokens, etc)
                    else {
                        console.log(`[Teste] Executando pré-requisito: ${step.name}`);
                        await processRequestStep(step, context);
                    }
                }
                
                // 2. Executa WAIT (Ignoramos delays longos no teste para ser rápido)
                else if (step.type === 'wait') {
                    if (step.id === targetStepId) {
                        targetResponse = { status: 200, data: { message: `Delay de ${step.delay}ms simulado com sucesso.` } };
                        found = true;
                    }
                }

                // 3. Executa SANKHYA
                else if (step.type === 'sankhya') {
                    if (step.id === targetStepId) {
                        let responseData;
                        if (step.operation === 'select') {
                            const resolvedSql = resolveVariables(step.sql, context);
                            const res = await executeSankhyaRequest('DbExplorerSP.executeQuery', { sql: resolvedSql, params: {} });
                            responseData = res.responseBody;
                        } 
                        else {
                            // Insert (Simulação)
                            const resolvedMapping = resolveVariables(step.mapping, context);
                            responseData = { 
                                status: "Simulação (Insert)",
                                message: "O registro abaixo SERIA inserido (mas não foi, por segurança).",
                                entity: step.tableName,
                                dataset: step.datasetId,
                                data: resolvedMapping
                            };
                        }
                        targetResponse = { status: 200, data: responseData };
                        found = true;
                    } 
                    else {
                        // Se for um passo anterior (Dependência), executamos se for SELECT para popular variáveis
                        if (step.operation === 'select') {
                            console.log(`[Teste] Executando pré-requisito Sankhya: ${step.name}`);
                            const resolvedSql = resolveVariables(step.sql, context);
                            const res = await executeSankhyaRequest('DbExplorerSP.executeQuery', { sql: resolvedSql, params: {} });
                            
                            // Extrair variáveis para o contexto (Copiado da lógica do executor)
                            if (step.extracts && Array.isArray(step.extracts)) {
                                const dataToExtract = res.responseBody;
                                step.extracts.forEach(ext => {
                                    const rawVal = _.get(dataToExtract, ext.path);
                                    if (ext.isList) {
                                        if (Array.isArray(rawVal)) {
                                            context[ext.variableName] = rawVal;
                                        } else {
                                            const arrayPathMatch = ext.path.match(/^(.*)\[\d+\](\..+)?$/);
                                            if (arrayPathMatch) {
                                                const rootArray = _.get(dataToExtract, arrayPathMatch[1]);
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
                        }
                    }
                }

            } catch (stepError) {
                // Se um passo anterior falhar, o teste do passo alvo falha por dependência
                throw new Error(`Falha no passo anterior "${step.name}": ${stepError.message}`);
            }
        }

        if (targetResponse) {
            res.json(targetResponse);
        } else {
            throw new Error("Passo alvo não encontrado no fluxo enviado.");
        }

    } catch (error) {
        const status = error.response?.status || 500;
        const msg = error.message;
        const data = error.response?.data;
        
        console.error(`[Teste Erro] ${msg}`);
        res.status(status).json({
            error: msg,
            data: data
        });
    }
};

// --- CONFIGURAÇÃO ERP ---

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