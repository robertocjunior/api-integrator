import { createApp } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import JsonTree from './components/JsonTree.js';
import languages from './lang.js';

createApp({
    components: { JsonTree },
    data() {
        return {
            // Sistema
            currentLang: 'pt-BR',
            texts: languages['pt-BR'],
            view: 'editor', // 'editor' ou 'settings'

            // Configurações ERP
            erpConfig: { baseUrl: '', user: '', password: '' },

            // Lógica de Fluxos
            flows: [],
            currentFlowIndex: -1,
            activeStepId: null,
            flowStatus: {},
            saving: false,
            intervalUnit: 1000, 
            
            // Modal e Variáveis Auxiliares
            varModal: null,
            tempStep: null,
            tempVarPath: '',
            tempVarValue: '',
            tempVarName: ''
        }
    },
    computed: {
        t() { return this.texts; },
        currentFlow() { return this.flows[this.currentFlowIndex]; },
        
        // Conversão de tempo (ms <-> unidade)
        displayInterval: {
            get() {
                if (!this.currentFlow) return 0;
                return Math.round((this.currentFlow.interval || 0) / this.intervalUnit);
            },
            set(val) {
                if (this.currentFlow) {
                    this.currentFlow.interval = val * this.intervalUnit;
                }
            }
        }
    },
    watch: {
        currentFlowIndex(newIdx) {
            if (newIdx > -1 && this.flows[newIdx]) {
                const ms = this.flows[newIdx].interval;
                if (ms >= 60000 && ms % 60000 === 0) this.intervalUnit = 60000;
                else this.intervalUnit = 1000;
            }
        }
    },
    mounted() {
        this.varModal = new bootstrap.Modal(document.getElementById('varModal'));
        this.loadFlows();
        this.loadErpConfig(); // Carrega config do Sankhya
        
        const socket = io();
        socket.on('flow-status', (data) => {
            this.flowStatus[data.id] = data;
        });
    },
    methods: {
        // --- FLUXOS ---
        async loadFlows() {
            try {
                const res = await fetch('/api/flows');
                this.flows = await res.json() || [];
                if (this.flows.length > 0) this.selectFlow(0);
            } catch (e) { console.error(e); this.flows = []; }
        },
        async saveAll() {
            this.saving = true;
            await fetch('/api/flows', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(this.flows)
            });
            setTimeout(() => { this.saving = false; }, 500);
        },
        addNewFlow() {
            this.flows.push({
                id: 'flow_' + Date.now(),
                name: "Novo Fluxo",
                enabled: false,
                interval: 60000,
                steps: []
            });
            this.selectFlow(this.flows.length - 1);
        },
        selectFlow(idx) {
            this.currentFlowIndex = idx;
            this.activeStepId = null;
        },
        
        // --- BLOCOS (STEPS) ---
        addStep(type) {
            const newStep = {
                id: 'step_' + Date.now(),
                type: type,
                // Nome padrão baseado no tipo
                name: type === 'sankhya' ? 'Integração Sankhya' : (type === 'request' ? this.t.canvas.step_request : this.t.canvas.step_wait),
                
                // Propriedades Comuns
                delay: 1000,
                
                // Request
                method: 'GET',
                url: '',
                headers: {'Content-Type': 'application/json'},
                body: {},
                extracts: [],
                
                // Sankhya Defaults
                operation: 'insert',
                tableName: '',
                datasetId: '',
                sql: '',
                mapping: {}
            };
            this.currentFlow.steps.push(newStep);
        },
        removeStep(idx) { this.currentFlow.steps.splice(idx, 1); },
        moveStep(idx, direction) {
            const newIdx = idx + direction;
            if (newIdx >= 0 && newIdx < this.currentFlow.steps.length) {
                const temp = this.currentFlow.steps[idx];
                this.currentFlow.steps[idx] = this.currentFlow.steps[newIdx];
                this.currentFlow.steps[newIdx] = temp;
            }
        },
        getStepColor(type) {
            if (type === 'request') return 'bg-primary';
            if (type === 'sankhya') return 'bg-success';
            return 'bg-secondary';
        },

        // --- CONFIG SANKHYA ---
        async loadErpConfig() {
            try {
                const res = await fetch('/api/config/sankhya');
                if (res.ok) this.erpConfig = await res.json();
            } catch(e) { console.error('Erro config ERP', e); }
        },
        async saveErpConfig() {
            try {
                await fetch('/api/config/sankhya', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(this.erpConfig)
                });
                alert('Configuração salva com sucesso!');
            } catch(e) { alert('Erro ao salvar config: ' + e.message); }
        },
        async loadSankhyaColumns(step) {
            if (!step.tableName) return alert('Digite o nome da tabela primeiro.');
            
            try {
                const res = await fetch(`/api/sankhya/columns?tableName=${step.tableName}`);
                const columns = await res.json();
                
                if (columns.error) throw new Error(columns.error);

                if (!step.mapping) step.mapping = {};

                // Adiciona campos se não existirem
                columns.forEach(col => {
                    if (step.mapping[col.name] === undefined) {
                        step.mapping[col.name] = '';
                    }
                });
            } catch (e) {
                alert('Erro ao buscar metadados: ' + e.message);
            }
        },

        // --- HEADERS / BODY ---
        addHeader(step) { step.headers['New-Header'] = ''; },
        deleteHeader(step, key) { delete step.headers[key]; },
        updateHeaderKey(step, oldKey, newKey) {
            if (oldKey !== newKey) {
                step.headers[newKey] = step.headers[oldKey];
                delete step.headers[oldKey];
            }
        },
        updateBody(step, val) {
            try { step.body = JSON.parse(val); } catch(e){}
        },

        // --- TESTES E EXTRAÇÃO ---
        async runTest(step) {
            step.testLoading = true;
            step.lastResponse = null;
            const mockContext = {}; 
            try {
                const res = await fetch('/api/test-step', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ ...step, contextMock: mockContext })
                });
                step.lastResponse = await res.json();
            } catch (e) {
                alert(this.t.errors.test_error + e.message);
            } finally {
                step.testLoading = false;
            }
        },
        addExtraction(step, path, val) {
            this.tempStep = step;
            this.tempVarPath = path;
            this.tempVarValue = val;
            this.tempVarName = '';
            this.varModal.show();
        },
        confirmExtraction() {
            if (this.tempVarName && this.tempStep) {
                if (!this.tempStep.extracts) this.tempStep.extracts = [];
                this.tempStep.extracts.push({
                    path: this.tempVarPath,
                    variableName: this.tempVarName.toUpperCase()
                });
                this.varModal.hide();
            }
        }
    }
}).mount('#app');