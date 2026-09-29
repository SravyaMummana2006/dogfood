import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { requireAuth, requireOrganizer } from '../middleware/auth';
import * as webhookService from '../services/webhook.service';

const router = Router({ mergeParams: true });

router.use(requireAuth, requireOrganizer);

const createWebhookSchema = z.object({
  url: z.string().url().max(2000),
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const webhooks = await webhookService.listWebhooks(req.params.id, req.user!.id);
    res.json({ data: webhooks });
  } catch (err) {
    next(err);
  }
});

router.post('/', validate(createWebhookSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const webhook = await webhookService.createWebhook(req.params.id, req.body.url, req.user!.id);
    res.status(201).json({ data: webhook });
  } catch (err) {
    next(err);
  }
});

router.get('/:webhookId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const webhook = await webhookService.getWebhook(req.params.webhookId, req.user!.id);
    // ensure webhook belongs to this hackathon
    if (webhook.hackathon_id !== req.params.id) {
      return res.status(404).json({ error: 'Webhook not found' });
    }
    res.json({ data: webhook });
  } catch (err) {
    next(err);
  }
});

const updateWebhookSchema = z.object({
  url: z.string().url().max(2000),
  is_active: z.boolean(),
});

router.put('/:webhookId', validate(updateWebhookSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const webhook = await webhookService.getWebhook(req.params.webhookId, req.user!.id);
    if (webhook.hackathon_id !== req.params.id) {
      return res.status(404).json({ error: 'Webhook not found' });
    }
    const updated = await webhookService.updateWebhook(req.params.webhookId, req.body.url, req.body.is_active, req.user!.id);
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/:webhookId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const webhook = await webhookService.getWebhook(req.params.webhookId, req.user!.id);
    if (webhook.hackathon_id !== req.params.id) {
      return res.status(404).json({ error: 'Webhook not found' });
    }
    await webhookService.deleteWebhook(req.params.webhookId, req.user!.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.post('/:webhookId/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const webhook = await webhookService.getWebhook(req.params.webhookId, req.user!.id);
    if (webhook.hackathon_id !== req.params.id) {
      return res.status(404).json({ error: 'Webhook not found' });
    }
    await webhookService.sendTestWebhook(req.params.webhookId, req.user!.id);
    res.json({ data: { success: true } });
  } catch (err) {
    next(err);
  }
});

router.get('/:webhookId/deliveries', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const webhook = await webhookService.getWebhook(req.params.webhookId, req.user!.id);
    if (webhook.hackathon_id !== req.params.id) {
      return res.status(404).json({ error: 'Webhook not found' });
    }
    const deliveries = await webhookService.getWebhookDeliveries(req.params.webhookId, req.user!.id);
    res.json({ data: deliveries });
  } catch (err) {
    next(err);
  }
});

export default router;
