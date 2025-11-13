import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import apiRoutes from './src/routes/index.js';
import { initScheduler } from './src/engine/scheduler.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Disponibiliza o IO para os controllers/engine
app.set('io', io);

// Rotas
app.use('/api', apiRoutes);

// Inicializa o Motor
initScheduler(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Hub Integrador rodando em http://localhost:${PORT}`);
});