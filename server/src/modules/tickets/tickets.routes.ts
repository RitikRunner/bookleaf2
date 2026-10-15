import { Router, type Request } from 'express';
import { classifyTicket } from '../../ai/classifier.js';
import { getDraft } from '../../ai/drafter.js';
import { currentUser, requireRole } from '../../middleware/authenticate.js';
import { ticketCreationLimiter } from '../../middleware/rateLimits.js';
import { parse } from '../../lib/validation.js';
import * as ticketsService from './tickets.service.js';
import {
  adminMessageSchema,
  adminTicketListQuery,
  authorMessageSchema,
  authorTicketListQuery,
  createTicketSchema,
  noteSchema,
  ticketParams,
  updateTicketSchema,
} from './tickets.schemas.js';

export const ticketsRouter = Router();

const ticketIdOf = (req: Request) => parse(ticketParams, req.params, 'params').ticketId;

// Authors get their own tickets; admins get the full queue with triage filters.
ticketsRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const result =
    user.role === 'ADMIN'
      ? await ticketsService.listAdminTickets(user, parse(adminTicketListQuery, req.query, 'query'))
      : await ticketsService.listAuthorTickets(user, parse(authorTicketListQuery, req.query, 'query'));
  res.json(result);
});

ticketsRouter.post('/', requireRole('AUTHOR'), ticketCreationLimiter, async (req, res) => {
  const input = parse(createTicketSchema, req.body, 'body');
  const ticket = await ticketsService.createTicket(currentUser(req), input);
  res.status(201).json({ data: ticket });
});

ticketsRouter.get('/:ticketId', async (req, res) => {
  res.json({ data: await ticketsService.getTicket(currentUser(req), ticketIdOf(req)) });
});

ticketsRouter.patch('/:ticketId', requireRole('ADMIN'), async (req, res) => {
  const input = parse(updateTicketSchema, req.body, 'body');
  res.json({ data: await ticketsService.updateTicket(ticketIdOf(req), input) });
});

ticketsRouter.post('/:ticketId/messages', async (req, res) => {
  const user = currentUser(req);
  const ticketId = ticketIdOf(req);
  const message =
    user.role === 'ADMIN'
      ? await ticketsService.addAdminMessage(user, ticketId, parse(adminMessageSchema, req.body, 'body'))
      : await ticketsService.addAuthorMessage(user, ticketId, parse(authorMessageSchema, req.body, 'body'));
  res.status(201).json({ data: message });
});

ticketsRouter.get('/:ticketId/notes', requireRole('ADMIN'), async (req, res) => {
  res.json({ data: await ticketsService.listNotes(ticketIdOf(req)) });
});

ticketsRouter.post('/:ticketId/notes', requireRole('ADMIN'), async (req, res) => {
  const input = parse(noteSchema, req.body, 'body');
  res.status(201).json({ data: await ticketsService.addNote(currentUser(req), ticketIdOf(req), input) });
});

// AI draft for the ticket: served from cache unless the ticket changed. 503 AI_UNAVAILABLE means "write manually".
ticketsRouter.get('/:ticketId/draft', requireRole('ADMIN'), async (req, res) => {
  res.json({ data: await getDraft(ticketIdOf(req), { regenerate: false }) });
});

// Ask for a fresh draft even if nothing changed.
ticketsRouter.post('/:ticketId/draft', requireRole('ADMIN'), async (req, res) => {
  const draft = await getDraft(ticketIdOf(req), { regenerate: true });
  res.status(draft.freshness === 'GENERATED' ? 201 : 200).json({ data: draft });
});

// Re-run classification now (e.g. after the AI recovers). Admin overrides are kept.
ticketsRouter.post('/:ticketId/classification', requireRole('ADMIN'), async (req, res) => {
  const ticketId = ticketIdOf(req);
  await classifyTicket(ticketId);
  res.json({ data: await ticketsService.getTicket(currentUser(req), ticketId) });
});
