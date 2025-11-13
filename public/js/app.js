import { createApp } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import JsonTree from './components/JsonTree.js';

createApp({
    components: { JsonTree },
    data() {
        return {
            flows: [],
            currentFlowIndex: -1,
            activeStepId: null,
            flowStatus: {},
            saving: false,
            
            // Modal Variável
            varModal: null,
            tempStep: null,
            tempVarPath: '',
            tempVarValue: '',
            tempVarName: ''
        }
    },
    computed: {
        currentFlow() { return this.flows[this.currentFlowIndex]; }
    },
    mounted() {
        this.varModal = new bootstrap.Modal(document.getElementById('varModal'));
        this.loadFlows();
        
        const socket = io();
        socket.on('flow-status', (data) => {
            this.flowStatus[data.id] = data;
        });
    },
    methods: {
        async loadFlows() {
            const res = await fetch('/api/flows');
            this.flows = await res.json();
        },
        async saveAll() {
            this.saving = true;
            await fetch('/api/flows', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(this.flows)
            });
            this.saving = false;
        },
        addNewFlow() {
            this.flows.push({
                id: 'flow_' + Date.now(),
                name: 'Novo Fluxo',
                enabled: false,
                interval: 60000,
                steps: []
            });
            this.currentFlowIndex = this.flows.length - 1;
        },
        selectFlow(idx) {
            this.currentFlowIndex = idx;
            this.activeStepId = null;
        },
        addStep(type) {
            this.currentFlow.steps.push({
                id: 'step_' + Date.now(),
                type: type,
                name: type === 'request' ? 'Nova Requisição' : 'Delay',
                method: 'GET',
                url: '',
                headers: {},
                body: {},
                extracts: [],
                delay: 1000
            });
        },
        removeStep(idx) {
            this.currentFlow.steps.splice(idx, 1);
        },
        moveStep(idx, direction) {
            const newIdx = idx + direction;
            if (newIdx >= 0 && newIdx < this.currentFlow.steps.length) {
                const temp = this.currentFlow.steps[idx];
                this.currentFlow.steps[idx] = this.currentFlow.steps[newIdx];
                this.currentFlow.steps[newIdx] = temp;
            }
        },
        getStepColor(type) {
            return type === 'request' ? 'bg-primary' : 'bg-secondary';
        },
        
        // Headers Logic
        addHeader(step) { step.headers['Content-Type'] = 'application/json'; },
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

        // Lógica de Teste e Extração
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
                alert('Erro ao testar: ' + e.message);
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