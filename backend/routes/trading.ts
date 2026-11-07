import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { exnessRequest, getAccountId } from '../exness/client.js';

const router = Router();

// Balance y estado de cuenta
router.get('/account', async (_req, res) => {
  try {
    const data = await exnessRequest('GET', `/v1/configuration/accounts/${getAccountId()}/account`);
    res.json(data);
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

// Posiciones abiertas
router.get('/positions', async (_req, res) => {
  try {
    const data = await exnessRequest('GET', `/v1/trading/accounts/${getAccountId()}/positions`);
    res.json(data);
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

// Historial (deals cerrados)
router.get('/history', async (_req, res) => {
  try {
    const data = await exnessRequest('GET', `/v1/trading/accounts/${getAccountId()}/deals`);
    res.json(data);
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

// Instrumentos disponibles (para el formulario)
router.get('/instruments', async (_req, res) => {
  try {
    const data = await exnessRequest('GET', `/v1/configuration/accounts/${getAccountId()}/instruments`);
    res.json(data);
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

// Abrir posición
router.post('/positions', async (req, res) => {
  try {
    const { instrument, side, volume } = req.body;
    if (!instrument || !side || !volume) {
      return res.status(400).json({ error: 'instrument, side y volume son requeridos' });
    }
    const data = await exnessRequest(
      'POST',
      `/v1/trading/accounts/${getAccountId()}/positions`,
      { instrument, side, volume: Number(volume) },
      randomUUID(),
    );
    res.json(data);
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

// Cerrar posición
router.delete('/positions/:id', async (req, res) => {
  try {
    const data = await exnessRequest(
      'DELETE',
      `/v1/trading/accounts/${getAccountId()}/positions/${req.params.id}`,
      undefined,
      randomUUID(),
    );
    res.json(data);
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

export default router;
