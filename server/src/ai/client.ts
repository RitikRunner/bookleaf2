import { GoogleGenAI } from '@google/genai';
import { env, isAiConfigured } from '../config/env.js';

// Created only when AI is enabled and a key is present. The key is read from the environment on the server
// and never leaves it: the browser only ever talks to our API.
const client = isAiConfigured ? new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }) : null;

/** The shared Gemini client, or null when AI is disabled (the app then runs in manual mode). */
export function getAiClient(): GoogleGenAI | null {
  return client;
}
