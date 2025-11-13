import express from 'express';
import * as FlowController from '../controllers/flowController.js';

const router = express.Router();

// Rotas de Fluxos
router.get('/flows', FlowController.getFlows);
router.post('/flows', FlowController.saveFlows);

// Rota de Teste (Proxy)
router.post('/test-step', FlowController.testStep);

// ...
// Rotas ERP Sankhya
router.get('/config/sankhya', FlowController.getErpConfig);
router.post('/config/sankhya', FlowController.saveErpConfig);
router.get('/sankhya/columns', FlowController.getTableColumns);

export default router;