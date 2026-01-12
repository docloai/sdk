/**
 * Puppeteer Renderer for Document Rendering
 *
 * This module handles:
 * 1. Launching Puppeteer and creating a page
 * 2. Rendering HTML and waiting for completion
 * 3. Applying degradation effects
 * 4. Extracting bounding boxes
 * 5. Taking screenshots
 */

import type { PuppeteerRenderOptions, PuppeteerRenderResult, BoundingBox } from './types';

/**
 * Puppeteer module type (dynamically imported)
 */
type PuppeteerModule = typeof import('puppeteer');

/**
 * Render HTML using Puppeteer and return screenshot
 *
 * @param options - Render options including HTML and degradation settings
 * @returns Render result with image and applied effects
 */
export async function renderWithPuppeteer(options: PuppeteerRenderOptions): Promise<PuppeteerRenderResult> {
  const {
    html,
    viewport,
    degradation,
    degradationSeed,
    extractBoundingBoxes,
    browser: providedBrowser,
    executablePath,
    launchOptions,
  } = options;

  // Track if we own the browser (to know if we should close it)
  const browserOwned = !providedBrowser;
  let browser: import('puppeteer').Browser;

  if (providedBrowser) {
    // Use user-provided browser instance
    browser = providedBrowser;
  } else {
    // Dynamically import Puppeteer and launch
    let puppeteer: PuppeteerModule;
    try {
      puppeteer = await import('puppeteer');
    } catch {
      throw new Error(
        'puppeteer is required for renderDocument but is not installed.\n' +
          'Install it with: npm install puppeteer\n' +
          'Or with pnpm: pnpm add puppeteer\n' +
          'For serverless environments, use @sparticuz/chromium with puppeteer-core'
      );
    }

    browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath,
      ...launchOptions,
    });
  }

  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
    });

    // Capture browser console errors for debugging
    const browserErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        browserErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      browserErrors.push(`Page error: ${(err as Error).message}`);
    });

    // Set content directly (no server needed)
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

    // Wait for React to render
    await page
      .waitForFunction(() => (window as unknown as { __RENDER_COMPLETE__?: boolean }).__RENDER_COMPLETE__ === true, {
        timeout: 15000,
      })
      .catch(() => {
        // Render flag not set - may still work, continue
      });

    // Wait for fonts to load
    await page.evaluate(() => document.fonts.ready);
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Check for document element
    const hasDocument = await page.$('.d-document');
    if (!hasDocument) {
      throw new Error(
        'Document failed to render. Browser errors: ' + (browserErrors.length > 0 ? browserErrors.join('; ') : 'none')
      );
    }

    // Extract bounding boxes before degradation if requested
    let boundingBoxes: BoundingBox[] | undefined;
    if (extractBoundingBoxes) {
      boundingBoxes = await extractFieldBoundingBoxes(page);
    }

    // Apply degradation effects
    let appliedEffects: string[] = [];
    let appliedElementEffects: string[] = [];

    if (degradation > 0) {
      // Step 1: Apply element-level CSS effects FIRST (before canvas capture)
      const elementResult = await page.evaluate(
        (intensity: number, seed: number) => {
          const applyElementEffects = (
            window as unknown as {
              __applyElementEffects?: (i: number, s: number) => string[];
            }
          ).__applyElementEffects;

          if (applyElementEffects) {
            return applyElementEffects(intensity, seed);
          }
          return [];
        },
        degradation,
        degradationSeed
      );

      appliedElementEffects = elementResult;

      // Wait for html2canvas to load
      await page
        .waitForFunction(() => typeof (window as unknown as { html2canvas?: unknown }).html2canvas === 'function', {
          timeout: 10000,
        })
        .catch(() => {
          // html2canvas not loaded - degradation may not apply
        });

      // Step 2: Apply canvas-level degradation effects
      const result = await page.evaluate(
        async (intensity: number, seed: number) => {
          const applyDegradation = (
            window as unknown as {
              __applyDegradation?: (i: number, s: number) => Promise<string[]>;
            }
          ).__applyDegradation;

          if (applyDegradation) {
            return await applyDegradation(intensity, seed);
          }
          return [];
        },
        degradation,
        degradationSeed
      );

      appliedEffects = result;

      // Wait for canvas to be rendered
      await page.waitForSelector('.d-document canvas', { timeout: 5000 }).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // Take screenshot
    const screenshotBuffer = (await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: viewport.width, height: viewport.height },
    })) as Buffer;

    const image = Buffer.from(screenshotBuffer).toString('base64');

    return {
      image,
      appliedEffects,
      appliedElementEffects,
      boundingBoxes,
    };
  } finally {
    // Only close browser if we launched it (not user-provided)
    if (browserOwned) {
      await browser.close();
    }
  }
}

/**
 * Extract bounding boxes from field elements
 */
async function extractFieldBoundingBoxes(page: import('puppeteer').Page): Promise<BoundingBox[]> {
  return await page.evaluate(() => {
    const elements = document.querySelectorAll('[data-field-id]');
    return Array.from(elements).map((el) => {
      const rect = el.getBoundingClientRect();
      const htmlEl = el as HTMLElement;
      return {
        fieldId: htmlEl.dataset.fieldId || '',
        label: htmlEl.dataset.fieldLabel || '',
        value: htmlEl.dataset.fieldValue || '',
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    });
  });
}
