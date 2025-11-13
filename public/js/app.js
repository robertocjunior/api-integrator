import { createApp } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import JsonTree from './components/JsonTree.js';
import languages from './lang.js';

createApp({
    components: { JsonTree },
    data() {
        return {
            currentLang: 'pt-BR',
            texts: languages['pt-BR'],
            view: 'editor', 
            erpConfig: { baseUrl: '', user: '', password: '' },
            flows: [],
            currentFlowIndex: -1,
            activeStepId: null,
            flowStatus: {},
            saving: false,
            intervalUnit: 1000, 
            
            varModal: null,
            tempStep: null,
            tempVarPath: '',
            tempVarValue: '',
            tempVarName: '',
            tempVarIsList: false,

            ctxMenu: { visible: false, x: 0, y: 0, targetElement: null, targetStep: null, targetKey: null, targetType: null }
        }
    },
    computed: {
        t() { return this.texts; },
        currentFlow() { return this.flows[this.currentFlowIndex]; },
        displayInterval: {
            get() {
                if (!this.currentFlow) return 0;
                return Math.round((this.currentFlow.interval || 0) / this.intervalUnit);
            },
            set(val) {
                if (this.currentFlow) this.currentFlow.interval = val * this.intervalUnit;
            }
        },
        availableVariables() {
            if (!this.currentFlow) return [];
            const vars = new Set();
            this.currentFlow.steps.forEach(step => {
                if (step.extracts) step.extracts.forEach(ext => vars.add(ext.variableName));
                if (step.type === 'manipulation' && step.operations) {
                    step.operations.forEach(op => { if (op.outputVar) vars.add(op.outputVar.toUpperCase()); });
                }
            });
            return Array.from(vars);
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
        this.loadErpConfig();
        const socket = io();
        socket.on('flow-status', (data) => { this.flowStatus[data.id] = data; });
    },
    methods: {
        async loadFlows() {
            try {
                const res = await fetch('/api/flows');
                this.flows = await res.json() || [];
                this.flows.forEach(flow => {
                    if (flow.steps) {
                        flow.steps.forEach(step => {
                            if (step.type === 'request') {
                                if (!step.timeout) step.timeout = 30000;
                                if (!step.timeoutUnit) step.timeoutUnit = (step.timeout >= 60000 && step.timeout % 60000 === 0) ? 60000 : 1000;
                                if (step.bodyEnabled === undefined) step.bodyEnabled = (step.method !== 'GET' && step.method !== 'HEAD');
                            }
                        });
                    }
                });
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
        addStep(type) {
            const newStep = {
                id: 'step_' + Date.now(),
                type: type,
                name: type === 'sankhya' ? 'Integração Sankhya' : (type === 'request' ? this.t.canvas.step_request : (type === 'manipulation' ? 'Tratamento de Dados' : this.t.canvas.step_wait)),
                delay: 1000,
                method: 'GET',
                url: '',
                timeout: 30000,
                timeoutUnit: 1000,
                headers: {'Content-Type': 'application/json'},
                body: {}, 
                bodyEnabled: false,
                extracts: [],
                operation: 'insert',
                tableName: '',
                datasetId: '',
                sql: '',
                mapping: {},
                operations: []
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
            if (type === 'manipulation') return 'bg-warning text-dark';
            return 'bg-secondary';
        },
        
        addOperation(step, type) {
            step.operations.push({
                type: type,
                input: '',
                outputVar: '',
                find: '', replace: '',
                map: {}, mapDefault: '',
                formatType: 'upper',
                formula: ''
            });
        },

        async loadErpConfig() { try { const res = await fetch('/api/config/sankhya'); if (res.ok) this.erpConfig = await res.json(); } catch(e) {} },
        async saveErpConfig() { try { await fetch('/api/config/sankhya', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(this.erpConfig) }); alert('Configuração salva!'); } catch(e) { alert('Erro: ' + e.message); } },
        async loadSankhyaColumns(step) {
            if (!step.tableName) return alert('Digite o nome da tabela.');
            try {
                const res = await fetch(`/api/sankhya/columns?tableName=${step.tableName}`);
                const columns = await res.json();
                if (columns.error) throw new Error(columns.error);
                if (!step.mapping) step.mapping = {};
                columns.forEach(col => { if (step.mapping[col.name] === undefined) step.mapping[col.name] = ''; });
            } catch (e) { alert('Erro: ' + e.message); }
        },
        addHeader(step) { step.headers['New-Header'] = ''; },
        deleteHeader(step, key) { delete step.headers[key]; },
        updateHeaderKey(step, oldKey, newKey) { if (oldKey !== newKey) { step.headers[newKey] = step.headers[oldKey]; delete step.headers[oldKey]; } },
        updateBody(step, val) { if (!val || val.trim() === '') { step.body = {}; return; } try { step.body = JSON.parse(val); } catch(e){ } },

        async runTest(step) {
            step.testLoading = true;
            step.lastResponse = null;
            try {
                const res = await fetch('/api/test-step', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ flow: this.currentFlow, targetStepId: step.id })
                });
                const jsonResponse = await res.json();
                if (!res.ok) throw new Error(jsonResponse.error || 'Erro desconhecido');
                step.lastResponse = jsonResponse;
            } catch (e) { alert(this.t.errors.test_error + e.message); } finally { step.testLoading = false; }
        },
        addExtraction(step, path, val) {
            this.tempStep = step;
            this.tempVarPath = path;
            this.tempVarValue = val;
            this.tempVarName = '';
            this.tempVarIsList = false;
            if (Array.isArray(val) || path.includes('[')) this.tempVarIsList = true;
            this.varModal.show();
        },
        confirmExtraction() {
            if (this.tempVarName && this.tempStep) {
                if (!this.tempStep.extracts) this.tempStep.extracts = [];
                this.tempStep.extracts.push({ path: this.tempVarPath, variableName: this.tempVarName.toUpperCase(), isList: this.tempVarIsList });
                this.varModal.hide();
            }
        },
        showCtxMenu(event, type, step, key = null) {
            event.preventDefault(); 
            this.ctxMenu = { visible: true, x: event.clientX, y: event.clientY, targetElement: event.target, targetStep: step, targetKey: key, targetType: type };
            document.addEventListener('click', this.closeCtxMenu, { once: true });
        },
        closeCtxMenu() { this.ctxMenu.visible = false; },
        async handleCtxAction(action, payload = null) {
            const { targetElement, targetStep, targetKey, targetType } = this.ctxMenu;
            if (!targetElement) return;
            if (action === 'insert_var') {
                this.insertAtCursor(targetElement, `{{${payload}}}`);
                this.updateModelFromDOM(targetElement, targetStep, targetType, targetKey);
            }
            if (action === 'copy') { const text = targetElement.value.substring(targetElement.selectionStart, targetElement.selectionEnd) || targetElement.value; await navigator.clipboard.writeText(text); }
            if (action === 'paste') { try { const text = await navigator.clipboard.readText(); this.insertAtCursor(targetElement, text); this.updateModelFromDOM(targetElement, targetStep, targetType, targetKey); } catch (err) { alert('Use Ctrl+V'); } }
            this.closeCtxMenu();
        },
        insertAtCursor(input, text) {
            const start = input.selectionStart;
            const end = input.selectionEnd;
            const originalText = input.value;
            input.value = originalText.substring(0, start) + text + originalText.substring(end);
            input.selectionStart = input.selectionEnd = start + text.length;
            input.focus();
        },
        updateModelFromDOM(input, step, type, key) {
            const val = input.value;
            if (type === 'url') step.url = val;
            else if (type === 'header-key') { const oldKey = key; if (oldKey !== val) { step.headers[val] = step.headers[oldKey]; delete step.headers[oldKey]; } }
            else if (type === 'header-val') step.headers[key] = val;
            else if (type === 'body') { try { step.body = JSON.parse(val); } catch (e) { } }
            else if (type === 'sql') step.sql = val;
            else if (type === 'mapping') step.mapping[key] = val;
            else if (type === 'op-input') step.input = val;
        }
    }
}).mount('#app');