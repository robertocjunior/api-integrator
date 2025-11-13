import axios from 'axios';
import fs from 'fs';

const CONFIG_FILE = 'sankhya-config.json';

// Estado em memória
let currentSessionId = null;

export function getSankhyaConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG_FILE));
    }
    return { baseUrl: '', user: '', password: '' };
}

export function saveSankhyaConfig(config) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    currentSessionId = null; // Reseta sessão ao mudar config
}

async function login() {
    const config = getSankhyaConfig();
    if (!config.baseUrl) throw new Error("Sankhya não configurado.");

    const url = `${config.baseUrl}/mge/service.sbr?serviceName=MobileLoginSP.login&outputType=json`;
    const body = {
        serviceName: "MobileLoginSP.login",
        requestBody: {
            NOMUSU: { $: config.user },
            INTERNO: { $: config.password },
            KEEPCONNECTED: { $: "S" }
        }
    };

    try {
        const res = await axios.post(url, body);
        if (res.data.responseBody && res.data.responseBody.jsessionid) {
            currentSessionId = res.data.responseBody.jsessionid.$;
            console.log(`[Sankhya] Novo Login realizado. ID: ${currentSessionId.substring(0, 10)}...`);
            return currentSessionId;
        } else {
            throw new Error("Falha no login Sankhya: " + (res.data.statusMessage || "Erro desconhecido"));
        }
    } catch (e) {
        console.error("[Sankhya] Erro de conexão no login:", e.message);
        throw e;
    }
}

export async function executeSankhyaRequest(serviceName, requestBody, retry = true) {
    const config = getSankhyaConfig();
    
    if (!currentSessionId) await login();

    const url = `${config.baseUrl}/mge/service.sbr?serviceName=${serviceName}&outputType=json`;
    
    // Monta o envelope padrão do Sankhya
    const payload = {
        serviceName: serviceName,
        requestBody: requestBody
    };

    try {
        const res = await axios.post(url, payload, {
            headers: { 'Cookie': `JSESSIONID=${currentSessionId}` }
        });

        // Verifica se a sessão expirou (Status 3)
        if (res.data.status === '3' && retry) {
            console.warn("[Sankhya] Sessão expirada. Renovando e tentando novamente...");
            currentSessionId = null; // Força novo login
            return executeSankhyaRequest(serviceName, requestBody, false); // Retenta uma vez
        }

        return res.data;
    } catch (error) {
        throw new Error(`Erro na requisição Sankhya: ${error.message}`);
    }
}

// Helper específico para pegar colunas
export async function getTableMetadata(tableName) {
    const sql = `SELECT COLUMN_NAME, DATA_TYPE FROM ALL_TAB_COLUMNS WHERE TABLE_NAME = '${tableName.toUpperCase()}' ORDER BY COLUMN_ID`;
    
    const response = await executeSankhyaRequest('DbExplorerSP.executeQuery', {
        sql: sql,
        params: {}
    });

    if (response.status !== '1') {
        throw new Error(response.statusMessage || "Erro ao buscar metadados");
    }

    // Transforma o array de arrays em objetos legíveis
    const rows = response.responseBody.rows || [];
    return rows.map(row => ({
        name: row[0], // COLUMN_NAME
        type: row[1]  // DATA_TYPE
    }));
}