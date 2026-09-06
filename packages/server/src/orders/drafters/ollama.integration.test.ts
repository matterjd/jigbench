import { describe, expect, it } from 'vitest';
import { stubSurvey } from '@jigbench/core';
import { OllamaDrafter } from './ollama.js';

/**
 * The one REAL round trip against the desk's actual Ollama (decision 16: installed,
 * `qwen2.5-coder:7b` pulled). Guarded so CI and every other local run never depend on a
 * model being present — run it explicitly:
 *
 *   JIG_OLLAMA=1 npx vitest run --project server -t ollama
 */
const RUN_REAL_OLLAMA = process.env.JIG_OLLAMA === '1';

describe.runIf(RUN_REAL_OLLAMA)('OllamaDrafter — real ollama (JIG_OLLAMA=1)', () => {
  it(
    'drafts a real human face for a real mark and reports a measured cost',
    async () => {
      const drafter = new OllamaDrafter({ model: 'qwen2.5-coder:7b' });

      expect(await drafter.available()).toBe(true);

      const mark = {
        id: 'm-0001',
        number: 1,
        target: {
          path: 'body > app-invoice-detail > .due-date',
          component: 'InvoiceDetailComponent',
          file: 'src/app/invoices/invoice-detail/invoice-detail.ts',
          text: 'Due Jan 12',
        },
        prompt: 'the invoice due date should show how many days overdue',
        createdAt: new Date().toISOString(),
      };

      const survey = {
        ...stubSurvey(),
        stub: false,
        components: [
          {
            name: 'InvoiceDetailComponent',
            selector: 'app-invoice-detail',
            file: 'src/app/invoices/invoice-detail/invoice-detail.ts',
            standalone: true,
            inline: false,
            inputs: [{ name: 'invoiceId', required: true }],
            outputs: [],
            templateUrl: './invoice-detail.html',
            styleUrls: ['./invoice-detail.scss'],
          },
        ],
      };

      const result = await drafter.draftWithMeta(mark, { survey });

      // eslint-disable-next-line no-console
      console.log(`[JIG_OLLAMA] model=${result.model} elapsedMs=${result.elapsedMs} face=${JSON.stringify(result.human)}`);

      expect(result.model).toBe('qwen2.5-coder:7b');
      expect(result.elapsedMs).toBeGreaterThan(0);
      expect(typeof result.human.what).toBe('string');
      expect(result.human.what.length).toBeGreaterThan(0);
      expect(Array.isArray(result.human.acceptance)).toBe(true);
    },
    120_000,
  );
});
