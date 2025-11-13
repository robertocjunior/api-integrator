import axios from 'axios';
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
                    // Implementação similar ao request para popular contexto se necessário
                    if (step.id === targetStepId) {
                        let responseData;
                        if (step.operation === 'select') {
                            const resolvedSql = resolveVariables(step.sql, context);
                            const res = await executeSankhyaRequest('DbExplorerSP.executeQuery', { sql: resolvedSql, params: {} });
                            responseData = res.responseBody;
                        } 
                        else {
                            // Insert não deve ser executado em teste a menos que o usuário saiba o que está fazendo
                            // Por segurança, apenas validamos as variáveis
                            const resolvedMapping = resolveVariables(step.mapping, context);
                            responseData = { message: "Simulação de Insert (não executado para evitar lixo)", resolvedData: resolvedMapping };
                        }
                        
                        targetResponse = { status: 200, data: responseData };
                        found = true;
                    } 
                    else {
                        // Se for um passo anterior de select, poderia extrair variaveis (futuro)
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