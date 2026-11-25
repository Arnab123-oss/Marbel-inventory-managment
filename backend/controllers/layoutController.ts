import type {Request, Response} from 'express';
import type {AuthenticatedRequest} from '../middleware/auth.ts';
import Layout from '../models/Layout.ts';
import {
  createDefaultLayout,
  DEFAULT_KPI_ORDER,
  DEFAULT_WIDGET_ORDER,
  sanitizeLayoutServer,
} from '../services/seedService.ts';
import {saveStore} from '../services/storeService.ts';
import type {DashboardLayout, KpiId, WidgetId} from '../types/inventory.ts';

export const getLayout = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).authUser;
    const existing = Layout.findByUserId(user.id);
    if (!existing) {
      const created = Layout.upsertByUserId(user.id, createDefaultLayout());
      saveStore();
      return res.status(200).json({layout: created});
    }

    const {layout: sanitized, changed} = sanitizeLayoutServer(existing);
    if (changed) {
      Layout.upsertByUserId(user.id, sanitized);
      saveStore();
    }
    return res.status(200).json({layout: Layout.findByUserId(user.id)});
  } catch (error) {
    console.error('Get layout error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};

export const updateLayout = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).authUser;
    const body = req.body as Partial<DashboardLayout>;
    const current = Layout.findByUserId(user.id) || createDefaultLayout();

    const kpiOrder = Array.isArray(body.kpiOrder)
      ? body.kpiOrder.filter((k): k is KpiId => DEFAULT_KPI_ORDER.includes(k as KpiId))
      : current.kpiOrder;
    const widgetOrder = Array.isArray(body.widgetOrder)
      ? body.widgetOrder.filter((w): w is WidgetId =>
          DEFAULT_WIDGET_ORDER.includes(w as WidgetId),
        )
      : current.widgetOrder;
    const widgetSpans = body.widgetSpans
      ? {...current.widgetSpans, ...body.widgetSpans}
      : current.widgetSpans;

    const updated: DashboardLayout = {
      kpiOrder: kpiOrder.length === DEFAULT_KPI_ORDER.length ? kpiOrder : current.kpiOrder,
      widgetOrder:
        widgetOrder.length === DEFAULT_WIDGET_ORDER.length ? widgetOrder : current.widgetOrder,
      widgetSpans,
      updatedAt: new Date().toISOString(),
    };
    Layout.upsertByUserId(user.id, updated);
    saveStore();
    return res.status(200).json({layout: updated});
  } catch (error) {
    console.error('Update layout error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};

export const resetLayout = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).authUser;
    const reset = createDefaultLayout();
    Layout.upsertByUserId(user.id, reset);
    saveStore();
    return res.status(200).json({layout: reset});
  } catch (error) {
    console.error('Reset layout error:', error);
    return res.status(500).json({error: (error as Error).message});
  }
};
