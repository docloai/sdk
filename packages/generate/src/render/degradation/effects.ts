// =============================================================================
// Document Degradation Effects - Reusable Module
// =============================================================================
//
// This module exports all degradation effects in a format that can be easily
// applied to any image via canvas.
//
// Usage:
//   import { applyEffects, applyEffect, CATEGORIES, getEffectById } from './effects';
//
//   // Apply multiple effects to a canvas
//   applyEffects(ctx, canvas, {
//     gaussianBlur: { sigma: 0.5 },
//     rotation: { angle: 2, background: 'white' },
//     fadedToner: { fade: 30 }
//   });
//
//   // Or apply a single effect
//   applyEffect(ctx, canvas, 'gaussianBlur', { sigma: 0.5 });
//
// =============================================================================

export interface EffectParam {
  name: string;
  type: "range" | "select" | "checkbox";
  min?: number;
  max?: number;
  step?: number;
  default: number | string | boolean;
  options?: string[];
}

export interface Effect {
  id: string;
  name: string;
  params: EffectParam[];
  apply: (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, params: Record<string, any>) => void;
}

export interface Category {
  id: string;
  name: string;
  phase: "IMAGE";
  effects: Effect[];
}

// Helper functions
function getImageData(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function putImageData(ctx: CanvasRenderingContext2D, imageData: ImageData) {
  ctx.putImageData(imageData, 0, 0);
}

// =============================================================================
// Category A: Geometry and Framing
// =============================================================================

const categoryA: Category = {
  id: "A",
  name: "Geometry and Framing",
  phase: "IMAGE",
  effects: [
    {
      id: "rotation",
      name: "Rotation (skew)",
      params: [
        { name: "angle", type: "range", min: -15, max: 15, step: 0.5, default: 0 },
        { name: "background", type: "select", options: ["white", "off-white", "black"], default: "white" },
      ],
      apply: (ctx, canvas, params) => {
        const angle = (params.angle * Math.PI) / 180;
        if (angle === 0) return;

        const w = canvas.width;
        const h = canvas.height;
        const centerX = w / 2;
        const centerY = h / 2;

        // Save original content
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = w;
        tempCanvas.height = h;
        const tempCtx = tempCanvas.getContext("2d")!;
        tempCtx.drawImage(canvas, 0, 0);

        // Create larger canvas to hold rotated content without clipping
        // Calculate the bounding box of the rotated rectangle
        const cos = Math.abs(Math.cos(angle));
        const sin = Math.abs(Math.sin(angle));
        const newW = Math.ceil(w * cos + h * sin);
        const newH = Math.ceil(h * cos + w * sin);

        const rotatedCanvas = document.createElement("canvas");
        rotatedCanvas.width = newW;
        rotatedCanvas.height = newH;
        const rotatedCtx = rotatedCanvas.getContext("2d")!;

        // Fill with background color
        const bgColors: Record<string, string> = {
          white: "#ffffff",
          "off-white": "#f5f5f0",
          black: "#000000",
        };
        rotatedCtx.fillStyle = bgColors[params.background] || "#ffffff";
        rotatedCtx.fillRect(0, 0, newW, newH);

        // Draw rotated content centered in the larger canvas
        rotatedCtx.save();
        rotatedCtx.translate(newW / 2, newH / 2);
        rotatedCtx.rotate(angle);
        rotatedCtx.drawImage(tempCanvas, -centerX, -centerY);
        rotatedCtx.restore();

        // Clear original canvas and fill with background
        ctx.fillStyle = bgColors[params.background] || "#ffffff";
        ctx.fillRect(0, 0, w, h);

        // Clip to original document bounds and draw the rotated content
        // centered back on the original canvas
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.clip();
        ctx.drawImage(rotatedCanvas, (w - newW) / 2, (h - newH) / 2);
        ctx.restore();
      },
    },
    {
      id: "perspective",
      name: "Perspective Warp",
      params: [
        { name: "intensity", type: "range", min: 0, max: 50, step: 1, default: 0 },
      ],
      apply: (ctx, canvas, params) => {
        const intensity = params.intensity / 100;
        if (intensity === 0) return;

        const w = canvas.width;
        const h = canvas.height;

        // Save original content
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = w;
        tempCanvas.height = h;
        const tempCtx = tempCanvas.getContext("2d")!;
        tempCtx.drawImage(canvas, 0, 0);

        // Create larger canvas to hold transformed content
        // Perspective can expand the image, so add padding
        const padding = Math.ceil(Math.max(w, h) * intensity * 0.3);
        const newW = w + padding * 2;
        const newH = h + padding * 2;

        const transformedCanvas = document.createElement("canvas");
        transformedCanvas.width = newW;
        transformedCanvas.height = newH;
        const transformedCtx = transformedCanvas.getContext("2d")!;

        // Fill with white background
        transformedCtx.fillStyle = "#ffffff";
        transformedCtx.fillRect(0, 0, newW, newH);

        // Apply perspective transform centered in larger canvas
        transformedCtx.save();
        transformedCtx.translate(newW / 2, padding);
        transformedCtx.transform(1, intensity * 0.08, intensity * 0.04, 1 - intensity * 0.15, 0, 0);
        transformedCtx.translate(-w / 2, 0);
        transformedCtx.drawImage(tempCanvas, 0, 0);
        transformedCtx.restore();

        // Clear original canvas
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);

        // Clip to document bounds and draw the transformed content
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.clip();
        ctx.drawImage(transformedCanvas, -padding, -padding);
        ctx.restore();
      },
    },
    {
      id: "shear",
      name: "Shear",
      params: [
        { name: "shearX", type: "range", min: -30, max: 30, step: 1, default: 0 },
        { name: "shearY", type: "range", min: -30, max: 30, step: 1, default: 0 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.shearX === 0 && params.shearY === 0) return;

        const w = canvas.width;
        const h = canvas.height;

        // Save original content
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = w;
        tempCanvas.height = h;
        const tempCtx = tempCanvas.getContext("2d")!;
        tempCtx.drawImage(canvas, 0, 0);

        const shearX = params.shearX / 100;
        const shearY = params.shearY / 100;

        // Calculate how much the shear will extend beyond bounds
        // Shear transform: x' = x + shearX*y, y' = y + shearY*x
        const paddingX = Math.ceil(Math.abs(shearX) * h);
        const paddingY = Math.ceil(Math.abs(shearY) * w);
        const newW = w + paddingX * 2;
        const newH = h + paddingY * 2;

        const transformedCanvas = document.createElement("canvas");
        transformedCanvas.width = newW;
        transformedCanvas.height = newH;
        const transformedCtx = transformedCanvas.getContext("2d")!;

        // Fill with white background
        transformedCtx.fillStyle = "#ffffff";
        transformedCtx.fillRect(0, 0, newW, newH);

        // Apply shear transform centered in larger canvas
        transformedCtx.save();
        transformedCtx.translate(newW / 2, newH / 2);
        transformedCtx.transform(1, shearY, shearX, 1, 0, 0);
        transformedCtx.translate(-w / 2, -h / 2);
        transformedCtx.drawImage(tempCanvas, 0, 0);
        transformedCtx.restore();

        // Clear original canvas
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);

        // Clip to document bounds and draw the transformed content
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.clip();
        ctx.drawImage(transformedCanvas, -paddingX, -paddingY);
        ctx.restore();
      },
    },
    {
      id: "scale",
      name: "Scale / DPI Mismatch",
      params: [
        { name: "scale", type: "range", min: 85, max: 120, step: 1, default: 100 },
      ],
      apply: (ctx, canvas, params) => {
        const scale = params.scale / 100;
        if (scale === 1) return;

        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext("2d")!;
        tempCtx.drawImage(canvas, 0, 0);

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const newWidth = canvas.width * scale;
        const newHeight = canvas.height * scale;
        const offsetX = (canvas.width - newWidth) / 2;
        const offsetY = (canvas.height - newHeight) / 2;

        ctx.drawImage(tempCanvas, offsetX, offsetY, newWidth, newHeight);
      },
    },
    {
      id: "translation",
      name: "Translation / Mis-centering",
      params: [
        { name: "offsetX", type: "range", min: -50, max: 50, step: 1, default: 0 },
        { name: "offsetY", type: "range", min: -50, max: 50, step: 1, default: 0 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.offsetX === 0 && params.offsetY === 0) return;

        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext("2d")!;
        tempCtx.drawImage(canvas, 0, 0);

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(tempCanvas, params.offsetX, params.offsetY);
      },
    },
    {
      id: "cropping",
      name: "Cropping (hard cut)",
      params: [
        { name: "top", type: "range", min: 0, max: 15, step: 1, default: 0 },
        { name: "right", type: "range", min: 0, max: 15, step: 1, default: 0 },
        { name: "bottom", type: "range", min: 0, max: 15, step: 1, default: 0 },
        { name: "left", type: "range", min: 0, max: 15, step: 1, default: 0 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.top === 0 && params.right === 0 && params.bottom === 0 && params.left === 0) return;

        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext("2d")!;
        tempCtx.drawImage(canvas, 0, 0);

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const cropTop = (params.top / 100) * canvas.height;
        const cropRight = (params.right / 100) * canvas.width;
        const cropBottom = (params.bottom / 100) * canvas.height;
        const cropLeft = (params.left / 100) * canvas.width;

        const srcX = cropLeft;
        const srcY = cropTop;
        const srcW = canvas.width - cropLeft - cropRight;
        const srcH = canvas.height - cropTop - cropBottom;

        if (srcW > 0 && srcH > 0) {
          ctx.drawImage(tempCanvas, srcX, srcY, srcW, srcH, srcX, srcY, srcW, srcH);
        }
      },
    },
    {
      id: "partialPage",
      name: "Partial Page Capture (Feathered)",
      params: [
        { name: "missingSide", type: "select", options: ["none", "top", "bottom", "left", "right"], default: "none" },
        { name: "missingFraction", type: "range", min: 0, max: 50, step: 5, default: 20 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.missingSide === "none") return;

        const fraction = params.missingFraction / 100;

        let gradient: CanvasGradient;
        switch (params.missingSide) {
          case "top":
            gradient = ctx.createLinearGradient(0, 0, 0, canvas.height * fraction * 2);
            gradient.addColorStop(0, "#ffffff");
            gradient.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height * fraction * 2);
            break;
          case "bottom":
            gradient = ctx.createLinearGradient(0, canvas.height, 0, canvas.height * (1 - fraction * 2));
            gradient.addColorStop(0, "#ffffff");
            gradient.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = gradient;
            ctx.fillRect(0, canvas.height * (1 - fraction * 2), canvas.width, canvas.height * fraction * 2);
            break;
          case "left":
            gradient = ctx.createLinearGradient(0, 0, canvas.width * fraction * 2, 0);
            gradient.addColorStop(0, "#ffffff");
            gradient.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width * fraction * 2, canvas.height);
            break;
          case "right":
            gradient = ctx.createLinearGradient(canvas.width, 0, canvas.width * (1 - fraction * 2), 0);
            gradient.addColorStop(0, "#ffffff");
            gradient.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = gradient;
            ctx.fillRect(canvas.width * (1 - fraction * 2), 0, canvas.width * fraction * 2, canvas.height);
            break;
        }
      },
    },
    {
      id: "pageBoundary",
      name: "Page Boundary Visible",
      params: [
        { name: "margin", type: "range", min: 0, max: 50, step: 5, default: 0 },
        { name: "background", type: "select", options: ["scanner-bed", "desk", "solid-gray"], default: "scanner-bed" },
        { name: "shadowAmount", type: "range", min: 0, max: 50, step: 5, default: 20 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.margin === 0) return;

        const margin = params.margin;
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext("2d")!;
        tempCtx.drawImage(canvas, 0, 0);

        if (params.background === "scanner-bed") {
          ctx.fillStyle = "#1a1a1a";
        } else if (params.background === "desk") {
          ctx.fillStyle = "#8B7355";
        } else {
          ctx.fillStyle = "#404040";
        }
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (params.background === "scanner-bed") {
          for (let i = 0; i < 1000; i++) {
            ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.02})`;
            ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 1, 1);
          }
        }

        const shadowSize = params.shadowAmount;
        if (shadowSize > 0) {
          ctx.fillStyle = `rgba(0,0,0,0.3)`;
          ctx.fillRect(margin + shadowSize, margin + shadowSize, canvas.width - margin * 2, canvas.height - margin * 2);
        }

        ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height, margin, margin, canvas.width - margin * 2, canvas.height - margin * 2);
      },
    },
    {
      id: "borderArtifacts",
      name: "Border Artifacts",
      params: [
        { name: "color", type: "select", options: ["black", "white", "gray"], default: "black" },
        { name: "thickness", type: "range", min: 0, max: 20, step: 1, default: 0 },
        { name: "jitter", type: "range", min: 0, max: 10, step: 1, default: 0 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.thickness === 0) return;

        const colors: Record<string, string> = { black: "#000", white: "#fff", gray: "#808080" };
        ctx.strokeStyle = colors[params.color] || "#000";

        const t = params.thickness;
        const j = params.jitter;

        ctx.beginPath();
        ctx.moveTo(0, t / 2 + (Math.random() - 0.5) * j);
        ctx.lineTo(canvas.width, t / 2 + (Math.random() - 0.5) * j);
        ctx.lineWidth = t + (Math.random() - 0.5) * j;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, canvas.height - t / 2 + (Math.random() - 0.5) * j);
        ctx.lineTo(canvas.width, canvas.height - t / 2 + (Math.random() - 0.5) * j);
        ctx.lineWidth = t + (Math.random() - 0.5) * j;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(t / 2 + (Math.random() - 0.5) * j, 0);
        ctx.lineTo(t / 2 + (Math.random() - 0.5) * j, canvas.height);
        ctx.lineWidth = t + (Math.random() - 0.5) * j;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(canvas.width - t / 2 + (Math.random() - 0.5) * j, 0);
        ctx.lineTo(canvas.width - t / 2 + (Math.random() - 0.5) * j, canvas.height);
        ctx.lineWidth = t + (Math.random() - 0.5) * j;
        ctx.stroke();
      },
    },
  ],
};

// =============================================================================
// Category B: Focus and Motion
// =============================================================================

const categoryB: Category = {
  id: "B",
  name: "Focus and Motion",
  phase: "IMAGE",
  effects: [
    {
      id: "gaussianBlur",
      name: "Gaussian Blur",
      params: [
        { name: "sigma", type: "range", min: 0, max: 1, step: 0.1, default: 0 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.sigma === 0) return;
        ctx.filter = `blur(${params.sigma}px)`;
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext("2d")!;
        tempCtx.drawImage(canvas, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(tempCanvas, 0, 0);
        ctx.filter = "none";
      },
    },
    {
      id: "motionBlur",
      name: "Motion Blur",
      params: [
        { name: "length", type: "range", min: 0, max: 1.5, step: 0.1, default: 0 },
        { name: "angle", type: "range", min: 0, max: 360, step: 15, default: 0 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.length === 0) return;

        const imageData = getImageData(ctx, canvas);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;
        const length = params.length;
        const angle = (params.angle * Math.PI) / 180;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);

        const result = new Uint8ClampedArray(data.length);

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            let r = 0, g = 0, b = 0, a = 0, count = 0;

            for (let i = -length; i <= length; i++) {
              const sx = Math.round(x + dx * i);
              const sy = Math.round(y + dy * i);

              if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
                const idx = (sy * width + sx) * 4;
                r += data[idx];
                g += data[idx + 1];
                b += data[idx + 2];
                a += data[idx + 3];
                count++;
              }
            }

            const idx = (y * width + x) * 4;
            result[idx] = r / count;
            result[idx + 1] = g / count;
            result[idx + 2] = b / count;
            result[idx + 3] = a / count;
          }
        }

        imageData.data.set(result);
        putImageData(ctx, imageData);
      },
    },
    {
      id: "defocusBlur",
      name: "Defocus Blur (lens blur)",
      params: [
        { name: "radius", type: "range", min: 0, max: 1.5, step: 0.1, default: 0 },
        { name: "shape", type: "select", options: ["disk", "hexagon"], default: "disk" },
      ],
      apply: (ctx, canvas, params) => {
        if (params.radius === 0) return;
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext("2d")!;
        tempCtx.drawImage(canvas, 0, 0);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const r = params.radius;
        const samples = params.shape === "hexagon" ? 6 : 12;
        ctx.globalAlpha = 1 / (samples + 1);

        ctx.drawImage(tempCanvas, 0, 0);
        for (let i = 0; i < samples; i++) {
          const angle = (i / samples) * Math.PI * 2;
          const ox = Math.cos(angle) * r;
          const oy = Math.sin(angle) * r;
          ctx.drawImage(tempCanvas, ox, oy);
        }
        ctx.globalAlpha = 1;
      },
    },
    {
      id: "unsharpMask",
      name: "Unsharp Mask",
      params: [
        { name: "amount", type: "range", min: 0, max: 200, step: 10, default: 0 },
        { name: "radius", type: "range", min: 1, max: 5, step: 0.5, default: 1 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.amount === 0) return;

        const imageData = getImageData(ctx, canvas);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;
        const amount = params.amount / 100;
        const r = Math.ceil(params.radius);

        const blurred = new Uint8ClampedArray(data.length);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            let rSum = 0, gSum = 0, bSum = 0, count = 0;
            for (let dy = -r; dy <= r; dy++) {
              for (let dx = -r; dx <= r; dx++) {
                const nx = Math.min(width - 1, Math.max(0, x + dx));
                const ny = Math.min(height - 1, Math.max(0, y + dy));
                const idx = (ny * width + nx) * 4;
                rSum += data[idx];
                gSum += data[idx + 1];
                bSum += data[idx + 2];
                count++;
              }
            }
            const idx = (y * width + x) * 4;
            blurred[idx] = rSum / count;
            blurred[idx + 1] = gSum / count;
            blurred[idx + 2] = bSum / count;
            blurred[idx + 3] = data[idx + 3];
          }
        }

        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.max(0, Math.min(255, data[i] + (data[i] - blurred[i]) * amount));
          data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + (data[i + 1] - blurred[i + 1]) * amount));
          data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + (data[i + 2] - blurred[i + 2]) * amount));
        }

        putImageData(ctx, imageData);
      },
    },
    {
      id: "doubleImage",
      name: "Double Image (ghosting)",
      params: [
        { name: "offsetX", type: "range", min: -10, max: 10, step: 1, default: 0 },
        { name: "offsetY", type: "range", min: -10, max: 10, step: 1, default: 0 },
        { name: "ghostOpacity", type: "range", min: 0, max: 15, step: 1, default: 0 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.ghostOpacity === 0) return;

        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext("2d")!;
        tempCtx.drawImage(canvas, 0, 0);

        ctx.globalAlpha = params.ghostOpacity / 100;
        ctx.drawImage(tempCanvas, params.offsetX, params.offsetY);
        ctx.globalAlpha = 1;
      },
    },
  ],
};

// =============================================================================
// Category C: Tone/Contrast/Illumination
// =============================================================================

const categoryC: Category = {
  id: "C",
  name: "Tone/Contrast/Illumination",
  phase: "IMAGE",
  effects: [
    {
      id: "brightness",
      name: "Brightness/Contrast",
      params: [
        { name: "brightness", type: "range", min: -60, max: 60, step: 5, default: 0 },
        { name: "contrast", type: "range", min: -60, max: 80, step: 5, default: 0 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.brightness === 0 && params.contrast === 0) return;

        const brightness = 1 + params.brightness / 100;
        const contrast = 1 + params.contrast / 100;

        ctx.filter = `brightness(${brightness}) contrast(${contrast})`;
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext("2d")!;
        tempCtx.drawImage(canvas, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(tempCanvas, 0, 0);
        ctx.filter = "none";
      },
    },
    {
      id: "gamma",
      name: "Gamma",
      params: [
        { name: "gamma", type: "range", min: 0.2, max: 3, step: 0.1, default: 1 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.gamma === 1) return;

        const imageData = getImageData(ctx, canvas);
        const data = imageData.data;
        const gamma = params.gamma;
        const gammaCorrection = 1 / gamma;

        for (let i = 0; i < data.length; i += 4) {
          data[i] = 255 * Math.pow(data[i] / 255, gammaCorrection);
          data[i + 1] = 255 * Math.pow(data[i + 1] / 255, gammaCorrection);
          data[i + 2] = 255 * Math.pow(data[i + 2] / 255, gammaCorrection);
        }

        putImageData(ctx, imageData);
      },
    },
    {
      id: "vignette",
      name: "Vignetting",
      params: [
        { name: "strength", type: "range", min: 0, max: 100, step: 5, default: 0 },
        { name: "radius", type: "range", min: 80, max: 120, step: 5, default: 100 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.strength === 0) return;

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);
        const radius = (params.radius / 100) * maxDist;
        const strength = params.strength / 100;

        const gradient = ctx.createRadialGradient(centerX, centerY, radius * 0.5, centerX, centerY, radius);
        gradient.addColorStop(0, `rgba(0, 0, 0, 0)`);
        gradient.addColorStop(1, `rgba(0, 0, 0, ${strength})`);

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      },
    },
    {
      id: "colorCast",
      name: "Color Cast / Tint",
      params: [
        { name: "hue", type: "range", min: -180, max: 180, step: 10, default: 0 },
        { name: "saturation", type: "range", min: -100, max: 100, step: 10, default: 0 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.hue === 0 && params.saturation === 0) return;

        const saturation = 1 + params.saturation / 100;
        ctx.filter = `hue-rotate(${params.hue}deg) saturate(${saturation})`;
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext("2d")!;
        tempCtx.drawImage(canvas, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(tempCanvas, 0, 0);
        ctx.filter = "none";
      },
    },
    {
      id: "paperAging",
      name: "Paper Aging Tone",
      params: [
        { name: "yellowing", type: "range", min: 0, max: 100, step: 5, default: 0 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.yellowing === 0) return;

        const strength = params.yellowing / 100;
        ctx.fillStyle = `rgba(255, 248, 220, ${strength * 0.3})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.filter = `sepia(${strength * 0.3})`;
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext("2d")!;
        tempCtx.drawImage(canvas, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(tempCanvas, 0, 0);
        ctx.filter = "none";
      },
    },
    {
      id: "shadows",
      name: "Shadows",
      params: [
        { name: "type", type: "select", options: ["none", "edge", "gutter", "hand"], default: "none" },
        { name: "direction", type: "select", options: ["left", "right", "top", "bottom"], default: "left" },
        { name: "softness", type: "range", min: 10, max: 100, step: 10, default: 50 },
        { name: "opacity", type: "range", min: 10, max: 80, step: 5, default: 30 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.type === "none") return;

        const opacity = params.opacity / 100;
        const softness = params.softness;
        let gradient: CanvasGradient;

        if (params.type === "edge") {
          switch (params.direction) {
            case "left":
              gradient = ctx.createLinearGradient(0, 0, softness * 2, 0);
              break;
            case "right":
              gradient = ctx.createLinearGradient(canvas.width, 0, canvas.width - softness * 2, 0);
              break;
            case "top":
              gradient = ctx.createLinearGradient(0, 0, 0, softness * 2);
              break;
            default:
              gradient = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - softness * 2);
          }
          gradient.addColorStop(0, `rgba(0, 0, 0, ${opacity})`);
          gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else if (params.type === "gutter") {
          const centerX = canvas.width / 2;
          gradient = ctx.createLinearGradient(centerX - softness, 0, centerX + softness, 0);
          gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
          gradient.addColorStop(0.5, `rgba(0, 0, 0, ${opacity})`);
          gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = gradient;
          ctx.fillRect(centerX - softness, 0, softness * 2, canvas.height);
        } else if (params.type === "hand") {
          const x = params.direction === "left" ? 80 : canvas.width - 180;
          const y = canvas.height * 0.35;
          const baseOpacity = opacity * 0.4;

          for (let layer = 0; layer < 5; layer++) {
            const scale = 1 + layer * 0.3;
            const layerOpacity = baseOpacity / (layer + 1);

            const gradient = ctx.createRadialGradient(x, y, 0, x, y, 120 * scale);
            gradient.addColorStop(0, `rgba(0, 0, 0, ${layerOpacity})`);
            gradient.addColorStop(0.4, `rgba(0, 0, 0, ${layerOpacity * 0.6})`);
            gradient.addColorStop(0.7, `rgba(0, 0, 0, ${layerOpacity * 0.3})`);
            gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.ellipse(x + layer * 5, y + layer * 10, 100 * scale, 180 * scale, 0.3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      },
    },
    {
      id: "glare",
      name: "Glare / Specular Highlights",
      params: [
        { name: "count", type: "range", min: 0, max: 5, step: 1, default: 0 },
        { name: "size", type: "range", min: 100, max: 400, step: 25, default: 200 },
        { name: "intensity", type: "range", min: 20, max: 100, step: 10, default: 50 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.count === 0) return;

        for (let i = 0; i < params.count; i++) {
          const x = canvas.width * 0.2 + Math.random() * canvas.width * 0.6;
          const y = canvas.height * 0.2 + Math.random() * canvas.height * 0.6;
          const size = params.size * (0.7 + Math.random() * 0.6);
          const intensity = params.intensity / 100;

          const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
          gradient.addColorStop(0, `rgba(255, 255, 255, ${intensity})`);
          gradient.addColorStop(0.3, `rgba(255, 255, 255, ${intensity * 0.5})`);
          gradient.addColorStop(0.6, `rgba(255, 255, 255, ${intensity * 0.2})`);
          gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

          ctx.fillStyle = gradient;
          ctx.fillRect(x - size, y - size, size * 2, size * 2);
        }
      },
    },
    {
      id: "lampBanding",
      name: "Lamp Banding",
      params: [
        { name: "orientation", type: "select", options: ["horizontal", "vertical"], default: "horizontal" },
        { name: "frequency", type: "range", min: 5, max: 30, step: 1, default: 10 },
        { name: "amplitude", type: "range", min: 0, max: 30, step: 2, default: 0 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.amplitude === 0) return;

        const isHorizontal = params.orientation === "horizontal";
        const freq = params.frequency;
        const amp = params.amplitude / 100;

        const imageData = getImageData(ctx, canvas);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const pos = isHorizontal ? y : x;
            const band = Math.sin((pos / freq) * Math.PI * 2) * amp;
            const idx = (y * width + x) * 4;

            data[idx] = Math.max(0, Math.min(255, data[idx] * (1 + band)));
            data[idx + 1] = Math.max(0, Math.min(255, data[idx + 1] * (1 + band)));
            data[idx + 2] = Math.max(0, Math.min(255, data[idx + 2] * (1 + band)));
          }
        }

        putImageData(ctx, imageData);
      },
    },
    {
      id: "gradientShading",
      name: "Gradient Shading",
      params: [
        { name: "mode", type: "select", options: ["linear", "radial"], default: "linear" },
        { name: "intensity", type: "range", min: 0, max: 50, step: 5, default: 0 },
        { name: "angle", type: "range", min: 0, max: 360, step: 45, default: 0 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.intensity === 0) return;

        const intensity = params.intensity / 100;
        let gradient: CanvasGradient;

        if (params.mode === "radial") {
          gradient = ctx.createRadialGradient(
            canvas.width / 2, canvas.height / 2, 0,
            canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) / 2
          );
          gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
          gradient.addColorStop(1, `rgba(0, 0, 0, ${intensity})`);
        } else {
          const angle = (params.angle * Math.PI) / 180;
          const dx = Math.cos(angle) * canvas.width;
          const dy = Math.sin(angle) * canvas.height;
          gradient = ctx.createLinearGradient(
            canvas.width / 2 - dx / 2, canvas.height / 2 - dy / 2,
            canvas.width / 2 + dx / 2, canvas.height / 2 + dy / 2
          );
          gradient.addColorStop(0, `rgba(0, 0, 0, ${intensity})`);
          gradient.addColorStop(0.5, "rgba(0, 0, 0, 0)");
          gradient.addColorStop(1, `rgba(0, 0, 0, ${intensity})`);
        }

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      },
    },
    {
      id: "binarization",
      name: "Binarization Artifacts",
      params: [
        { name: "threshold", type: "range", min: 120, max: 160, step: 5, default: 128 },
        { name: "noise", type: "range", min: 0, max: 30, step: 2, default: 0 },
      ],
      apply: (ctx, canvas, params) => {
        const imageData = getImageData(ctx, canvas);
        const data = imageData.data;
        const threshold = params.threshold;
        const noise = params.noise;

        for (let i = 0; i < data.length; i += 4) {
          const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
          const noiseOffset = (Math.random() - 0.5) * noise * 2;
          const val = gray + noiseOffset > threshold ? 255 : 0;
          data[i] = val;
          data[i + 1] = val;
          data[i + 2] = val;
        }

        putImageData(ctx, imageData);
      },
    },
  ],
};

// =============================================================================
// Category D: Noise Models
// =============================================================================

const categoryD: Category = {
  id: "D",
  name: "Noise Models",
  phase: "IMAGE",
  effects: [
    {
      id: "gaussianNoise",
      name: "Gaussian Noise",
      params: [
        { name: "sigma", type: "range", min: 0, max: 50, step: 2, default: 0 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.sigma === 0) return;

        const imageData = getImageData(ctx, canvas);
        const data = imageData.data;
        const sigma = params.sigma;

        for (let i = 0; i < data.length; i += 4) {
          const u1 = Math.random();
          const u2 = Math.random();
          const noise = sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

          data[i] = Math.max(0, Math.min(255, data[i] + noise));
          data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
          data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
        }

        putImageData(ctx, imageData);
      },
    },
    {
      id: "saltPepper",
      name: "Salt-and-Pepper",
      params: [
        { name: "density", type: "range", min: 0, max: 2, step: 0.1, default: 0 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.density === 0) return;

        const imageData = getImageData(ctx, canvas);
        const data = imageData.data;
        const density = params.density / 100;

        for (let i = 0; i < data.length; i += 4) {
          if (Math.random() < density) {
            const val = Math.random() < 0.5 ? 0 : 255;
            data[i] = val;
            data[i + 1] = val;
            data[i + 2] = val;
          }
        }

        putImageData(ctx, imageData);
      },
    },
    {
      id: "jpegBlocking",
      name: "JPEG Blocking",
      params: [
        { name: "quality", type: "range", min: 90, max: 100, step: 1, default: 100 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.quality === 100) return;

        const blockSize = Math.max(2, Math.floor((100 - params.quality) / 10));
        const imageData = getImageData(ctx, canvas);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;

        for (let by = 0; by < height; by += blockSize) {
          for (let bx = 0; bx < width; bx += blockSize) {
            let r = 0, g = 0, b = 0, count = 0;

            for (let y = by; y < Math.min(by + blockSize, height); y++) {
              for (let x = bx; x < Math.min(bx + blockSize, width); x++) {
                const idx = (y * width + x) * 4;
                r += data[idx];
                g += data[idx + 1];
                b += data[idx + 2];
                count++;
              }
            }

            r = Math.round(r / count);
            g = Math.round(g / count);
            b = Math.round(b / count);

            for (let y = by; y < Math.min(by + blockSize, height); y++) {
              for (let x = bx; x < Math.min(bx + blockSize, width); x++) {
                const idx = (y * width + x) * 4;
                data[idx] = r;
                data[idx + 1] = g;
                data[idx + 2] = b;
              }
            }
          }
        }

        putImageData(ctx, imageData);
      },
    },
    {
      id: "speckle",
      name: "Speckle (multiplicative)",
      params: [
        { name: "strength", type: "range", min: 0, max: 30, step: 2, default: 0 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.strength === 0) return;

        const imageData = getImageData(ctx, canvas);
        const data = imageData.data;
        const strength = params.strength / 100;

        for (let i = 0; i < data.length; i += 4) {
          const noise = 1 + (Math.random() - 0.5) * 2 * strength;
          data[i] = Math.max(0, Math.min(255, data[i] * noise));
          data[i + 1] = Math.max(0, Math.min(255, data[i + 1] * noise));
          data[i + 2] = Math.max(0, Math.min(255, data[i + 2] * noise));
        }

        putImageData(ctx, imageData);
      },
    },
    {
      id: "scannerStreak",
      name: "Scanner Streak Noise",
      params: [
        { name: "orientation", type: "select", options: ["horizontal", "vertical"], default: "horizontal" },
        { name: "count", type: "range", min: 0, max: 20, step: 1, default: 0 },
        { name: "opacity", type: "range", min: 10, max: 50, step: 5, default: 20 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.count === 0) return;

        const isHorizontal = params.orientation === "horizontal";
        const opacity = params.opacity / 100;

        for (let i = 0; i < params.count; i++) {
          const pos = Math.random() * (isHorizontal ? canvas.height : canvas.width);
          const width = 1 + Math.random() * 2;
          const brightness = Math.random() > 0.5 ? 255 : 0;

          ctx.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness}, ${opacity})`;
          if (isHorizontal) {
            ctx.fillRect(0, pos, canvas.width, width);
          } else {
            ctx.fillRect(pos, 0, width, canvas.height);
          }
        }
      },
    },
    {
      id: "hotDeadPixels",
      name: "Hot/Dead Pixels",
      params: [
        { name: "count", type: "range", min: 0, max: 100, step: 5, default: 0 },
        { name: "type", type: "select", options: ["mixed", "hot", "dead"], default: "mixed" },
      ],
      apply: (ctx, canvas, params) => {
        if (params.count === 0) return;

        for (let i = 0; i < params.count; i++) {
          const x = Math.floor(Math.random() * canvas.width);
          const y = Math.floor(Math.random() * canvas.height);
          let color: string;

          if (params.type === "hot") {
            color = "#ffffff";
          } else if (params.type === "dead") {
            color = "#000000";
          } else {
            color = Math.random() > 0.5 ? "#ffffff" : "#000000";
          }

          ctx.fillStyle = color;
          ctx.fillRect(x, y, 1, 1);
        }
      },
    },
    {
      id: "dithering",
      name: "Dithering",
      params: [
        { name: "method", type: "select", options: ["ordered", "random"], default: "ordered" },
        { name: "strength", type: "range", min: 0, max: 60, step: 5, default: 0 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.strength === 0) return;

        const imageData = getImageData(ctx, canvas);
        const data = imageData.data;
        const width = canvas.width;
        const strength = params.strength / 100;

        const bayer = [
          [0, 8, 2, 10],
          [12, 4, 14, 6],
          [3, 11, 1, 9],
          [15, 7, 13, 5],
        ];

        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;

            let threshold: number;
            if (params.method === "ordered") {
              threshold = ((bayer[y % 4][x % 4] / 16) - 0.5) * 255 * strength;
            } else {
              threshold = (Math.random() - 0.5) * 255 * strength;
            }

            data[idx] = Math.max(0, Math.min(255, data[idx] + threshold));
            data[idx + 1] = Math.max(0, Math.min(255, data[idx + 1] + threshold));
            data[idx + 2] = Math.max(0, Math.min(255, data[idx + 2] + threshold));
          }
        }

        putImageData(ctx, imageData);
      },
    },
  ],
};

// =============================================================================
// Category E: Printing/Toner/Ink Artifacts
// =============================================================================

const categoryE: Category = {
  id: "E",
  name: "Printing/Toner/Ink Artifacts",
  phase: "IMAGE",
  effects: [
    {
      id: "fadedToner",
      name: "Faded Toner / Low Ink",
      params: [
        { name: "fade", type: "range", min: 0, max: 60, step: 5, default: 0 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.fade === 0) return;

        const imageData = getImageData(ctx, canvas);
        const data = imageData.data;
        const fade = params.fade / 100;

        for (let i = 0; i < data.length; i += 4) {
          data[i] = data[i] + (255 - data[i]) * fade;
          data[i + 1] = data[i + 1] + (255 - data[i + 1]) * fade;
          data[i + 2] = data[i + 2] + (255 - data[i + 2]) * fade;
        }

        putImageData(ctx, imageData);
      },
    },
    {
      id: "inkBleed",
      name: "Ink Bleed / Feathering",
      params: [
        { name: "amount", type: "range", min: 0, max: 5, step: 0.5, default: 0 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.amount === 0) return;

        ctx.filter = `blur(${params.amount * 0.5}px)`;
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext("2d")!;
        tempCtx.drawImage(canvas, 0, 0);
        ctx.globalCompositeOperation = "darken";
        ctx.drawImage(tempCanvas, 0, 0);
        ctx.globalCompositeOperation = "source-over";
        ctx.filter = "none";
      },
    },
    {
      id: "tonerSpecks",
      name: "Toner Specks",
      params: [
        { name: "density", type: "range", min: 0, max: 100, step: 5, default: 0 },
        { name: "size", type: "range", min: 1, max: 4, step: 0.5, default: 1 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.density === 0) return;

        const count = params.density;
        const size = params.size;

        ctx.fillStyle = "#000000";
        for (let i = 0; i < count; i++) {
          const x = Math.random() * canvas.width;
          const y = Math.random() * canvas.height;
          const r = size * (0.5 + Math.random() * 0.5);
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    },
    {
      id: "unevenInking",
      name: "Uneven Inking (bands)",
      params: [
        { name: "orientation", type: "select", options: ["horizontal", "vertical"], default: "horizontal" },
        { name: "frequency", type: "range", min: 2, max: 10, step: 1, default: 5 },
        { name: "amplitude", type: "range", min: 0, max: 30, step: 2, default: 0 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.amplitude === 0) return;

        const imageData = getImageData(ctx, canvas);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;
        const isHorizontal = params.orientation === "horizontal";
        const bandWidth = (isHorizontal ? height : width) / params.frequency;
        const amp = params.amplitude / 100;

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const pos = isHorizontal ? y : x;
            const fade = 1 - Math.sin((pos / bandWidth) * Math.PI) * amp;
            const idx = (y * width + x) * 4;

            const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
            if (brightness < 200) {
              data[idx] = Math.min(255, data[idx] + (255 - data[idx]) * (1 - fade));
              data[idx + 1] = Math.min(255, data[idx + 1] + (255 - data[idx + 1]) * (1 - fade));
              data[idx + 2] = Math.min(255, data[idx + 2] + (255 - data[idx + 2]) * (1 - fade));
            }
          }
        }

        putImageData(ctx, imageData);
      },
    },
    {
      id: "channelShift",
      name: "Misregistration (channel shift)",
      params: [
        { name: "redX", type: "range", min: -1, max: 1, step: 0.1, default: 0 },
        { name: "redY", type: "range", min: -1, max: 1, step: 0.1, default: 0 },
        { name: "blueX", type: "range", min: -1, max: 1, step: 0.1, default: 0 },
        { name: "blueY", type: "range", min: -1, max: 1, step: 0.1, default: 0 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.redX === 0 && params.redY === 0 && params.blueX === 0 && params.blueY === 0) return;

        const imageData = getImageData(ctx, canvas);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;
        const result = new Uint8ClampedArray(data.length);

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;

            const rx = Math.min(width - 1, Math.max(0, x + params.redX));
            const ry = Math.min(height - 1, Math.max(0, y + params.redY));
            const rIdx = (ry * width + rx) * 4;
            result[idx] = data[rIdx];

            result[idx + 1] = data[idx + 1];

            const bx = Math.min(width - 1, Math.max(0, x + params.blueX));
            const by = Math.min(height - 1, Math.max(0, y + params.blueY));
            const bIdx = (by * width + bx) * 4;
            result[idx + 2] = data[bIdx + 2];

            result[idx + 3] = data[idx + 3];
          }
        }

        imageData.data.set(result);
        putImageData(ctx, imageData);
      },
    },
    {
      id: "inkSetoff",
      name: "Ink Setoff (blurred transfer)",
      params: [
        { name: "offsetX", type: "range", min: -10, max: 10, step: 1, default: 0 },
        { name: "offsetY", type: "range", min: -10, max: 10, step: 1, default: 0 },
        { name: "opacity", type: "range", min: 0, max: 20, step: 2, default: 0 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.opacity === 0) return;

        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext("2d")!;
        tempCtx.drawImage(canvas, 0, 0);

        ctx.globalAlpha = params.opacity / 100;
        ctx.filter = "blur(2px)";
        ctx.drawImage(tempCanvas, params.offsetX, params.offsetY);
        ctx.filter = "none";
        ctx.globalAlpha = 1;
      },
    },
    {
      id: "moire",
      name: "Moire Patterns",
      params: [
        { name: "frequency", type: "range", min: 2, max: 10, step: 1, default: 4 },
        { name: "angle", type: "range", min: 0, max: 90, step: 15, default: 45 },
        { name: "intensity", type: "range", min: 0, max: 30, step: 2, default: 0 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.intensity === 0) return;

        const imageData = getImageData(ctx, canvas);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;
        const freq = params.frequency;
        const angle = (params.angle * Math.PI) / 180;
        const intensity = params.intensity / 100;

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const rotX = x * Math.cos(angle) + y * Math.sin(angle);
            const pattern = Math.sin(rotX / freq * Math.PI * 2) * intensity * 50;
            const idx = (y * width + x) * 4;

            data[idx] = Math.max(0, Math.min(255, data[idx] + pattern));
            data[idx + 1] = Math.max(0, Math.min(255, data[idx + 1] + pattern));
            data[idx + 2] = Math.max(0, Math.min(255, data[idx + 2] + pattern));
          }
        }

        putImageData(ctx, imageData);
      },
    },
    {
      id: "halftone",
      name: "Halftone Simulation",
      params: [
        { name: "intensity", type: "range", min: 0, max: 0.5, step: 0.05, default: 0 },
        { name: "dotSize", type: "range", min: 2, max: 6, step: 1, default: 3 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.intensity === 0) return;

        const imageData = getImageData(ctx, canvas);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;
        const dotSize = params.dotSize;
        const intensity = params.intensity;

        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext("2d")!;
        tempCtx.fillStyle = "#ffffff";
        tempCtx.fillRect(0, 0, width, height);

        for (let y = 0; y < height; y += dotSize) {
          for (let x = 0; x < width; x += dotSize) {
            let sum = 0, count = 0;
            for (let dy = 0; dy < dotSize && y + dy < height; dy++) {
              for (let dx = 0; dx < dotSize && x + dx < width; dx++) {
                const idx = ((y + dy) * width + (x + dx)) * 4;
                sum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
                count++;
              }
            }
            const brightness = sum / count;
            const dotRadius = ((255 - brightness) / 255) * (dotSize / 2) * 0.8;

            if (dotRadius > 0.3) {
              tempCtx.fillStyle = "#000000";
              tempCtx.beginPath();
              tempCtx.arc(x + dotSize / 2, y + dotSize / 2, dotRadius, 0, Math.PI * 2);
              tempCtx.fill();
            }
          }
        }

        ctx.globalAlpha = intensity;
        ctx.drawImage(tempCanvas, 0, 0);
        ctx.globalAlpha = 1;
      },
    },
  ],
};

// =============================================================================
// Category F: Paper Defects and Physical Damage
// =============================================================================

const categoryF: Category = {
  id: "F",
  name: "Paper Defects and Physical Damage",
  phase: "IMAGE",
  effects: [
    {
      id: "foldLines",
      name: "Fold Lines",
      params: [
        { name: "count", type: "range", min: 0, max: 3, step: 1, default: 0 },
        { name: "darkness", type: "range", min: 10, max: 50, step: 5, default: 20 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.count === 0) return;

        const darkness = params.darkness / 100;

        for (let i = 0; i < params.count; i++) {
          const isVertical = Math.random() > 0.5;
          const pos = 0.2 + Math.random() * 0.6;

          ctx.strokeStyle = `rgba(0, 0, 0, ${darkness})`;
          ctx.lineWidth = 2;
          ctx.beginPath();

          if (isVertical) {
            const x = canvas.width * pos;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
          } else {
            const y = canvas.height * pos;
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
          }

          ctx.stroke();
        }
      },
    },
    {
      id: "coffeeRings",
      name: "Coffee Rings",
      params: [
        { name: "count", type: "range", min: 0, max: 3, step: 1, default: 0 },
        { name: "opacity", type: "range", min: 10, max: 50, step: 5, default: 20 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.count === 0) return;

        const opacity = params.opacity / 100;

        for (let i = 0; i < params.count; i++) {
          const x = Math.random() * canvas.width;
          const y = Math.random() * canvas.height;
          const radius = 30 + Math.random() * 50;

          ctx.strokeStyle = `rgba(139, 90, 43, ${opacity})`;
          ctx.lineWidth = 3 + Math.random() * 4;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.stroke();
        }
      },
    },
    {
      id: "dust",
      name: "Dust",
      params: [
        { name: "density", type: "range", min: 0, max: 200, step: 10, default: 0 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.density === 0) return;

        for (let i = 0; i < params.density; i++) {
          const x = Math.random() * canvas.width;
          const y = Math.random() * canvas.height;
          const size = 0.5 + Math.random() * 1.5;
          const brightness = Math.random() > 0.5 ? 50 : 200;

          ctx.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness}, 0.5)`;
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    },
    {
      id: "scratches",
      name: "Scratches / Cut Marks",
      params: [
        { name: "count", type: "range", min: 0, max: 10, step: 1, default: 0 },
        { name: "brightness", type: "select", options: ["light", "dark", "mixed"], default: "light" },
      ],
      apply: (ctx, canvas, params) => {
        if (params.count === 0) return;

        for (let i = 0; i < params.count; i++) {
          const x1 = Math.random() * canvas.width;
          const y1 = Math.random() * canvas.height;
          const length = 30 + Math.random() * 120;
          const angle = Math.random() * Math.PI * 2;

          let isLight: boolean;
          if (params.brightness === "mixed") {
            isLight = Math.random() > 0.5;
          } else {
            isLight = params.brightness === "light";
          }

          ctx.save();
          ctx.translate(x1, y1);
          ctx.rotate(angle);

          const gradient = ctx.createLinearGradient(0, 0, length, 0);
          const baseAlpha = 0.3 + Math.random() * 0.3;
          const color = isLight ? "255, 255, 255" : "80, 60, 40";
          gradient.addColorStop(0, `rgba(${color}, ${baseAlpha * 0.5})`);
          gradient.addColorStop(0.2, `rgba(${color}, ${baseAlpha})`);
          gradient.addColorStop(0.8, `rgba(${color}, ${baseAlpha})`);
          gradient.addColorStop(1, `rgba(${color}, ${baseAlpha * 0.3})`);

          ctx.strokeStyle = gradient;
          ctx.lineWidth = 0.3 + Math.random() * 0.7;
          ctx.lineCap = "round";

          const curveAmount = (Math.random() - 0.5) * 20;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(length / 2, curveAmount, length, (Math.random() - 0.5) * 10);
          ctx.stroke();

          ctx.restore();
        }
      },
    },
    {
      id: "punchHoles",
      name: "Punch Holes",
      params: [
        { name: "count", type: "range", min: 0, max: 3, step: 1, default: 0 },
        { name: "radius", type: "range", min: 10, max: 20, step: 2, default: 12 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.count === 0) return;

        const margin = 30;
        const spacing = 100;
        const startY = (canvas.height - (params.count - 1) * spacing) / 2;

        for (let i = 0; i < params.count; i++) {
          const x = margin;
          const y = startY + i * spacing;

          ctx.fillStyle = "#1a1a1a";
          ctx.beginPath();
          ctx.arc(x, y, params.radius, 0, Math.PI * 2);
          ctx.fill();

          const gradient = ctx.createRadialGradient(x - 2, y - 2, 0, x, y, params.radius);
          gradient.addColorStop(0, "rgba(0,0,0,0.3)");
          gradient.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(x, y, params.radius + 3, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    },
    {
      id: "bentCorners",
      name: "Bent Corners",
      params: [
        { name: "corner", type: "select", options: ["none", "top-left", "top-right", "bottom-left", "bottom-right"], default: "none" },
        { name: "size", type: "range", min: 20, max: 80, step: 10, default: 40 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.corner === "none") return;

        const size = params.size;
        let x = 0, y = 0;

        switch (params.corner) {
          case "top-left": x = 0; y = 0; break;
          case "top-right": x = canvas.width; y = 0; break;
          case "bottom-left": x = 0; y = canvas.height; break;
          case "bottom-right": x = canvas.width; y = canvas.height; break;
        }

        ctx.save();
        ctx.beginPath();

        if (params.corner === "top-right") {
          ctx.moveTo(x, y);
          ctx.lineTo(x - size, y);
          ctx.quadraticCurveTo(x - size * 0.7, y + size * 0.3, x - size * 0.5, y + size * 0.5);
          ctx.lineTo(x, y + size);
          ctx.closePath();
        } else if (params.corner === "bottom-right") {
          ctx.moveTo(x, y);
          ctx.lineTo(x - size, y);
          ctx.quadraticCurveTo(x - size * 0.7, y - size * 0.3, x - size * 0.5, y - size * 0.5);
          ctx.lineTo(x, y - size);
          ctx.closePath();
        } else if (params.corner === "top-left") {
          ctx.moveTo(x, y);
          ctx.lineTo(x + size, y);
          ctx.quadraticCurveTo(x + size * 0.7, y + size * 0.3, x + size * 0.5, y + size * 0.5);
          ctx.lineTo(x, y + size);
          ctx.closePath();
        } else {
          ctx.moveTo(x, y);
          ctx.lineTo(x + size, y);
          ctx.quadraticCurveTo(x + size * 0.7, y - size * 0.3, x + size * 0.5, y - size * 0.5);
          ctx.lineTo(x, y - size);
          ctx.closePath();
        }

        ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
        ctx.fill();

        ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
        ctx.fill();

        ctx.restore();
      },
    },
    {
      id: "wrinkles",
      name: "Wrinkles/Crumpling",
      params: [
        { name: "intensity", type: "range", min: 0, max: 100, step: 5, default: 0 },
        { name: "scale", type: "range", min: 20, max: 80, step: 10, default: 40 },
        { name: "seed", type: "range", min: 1, max: 100, step: 1, default: 42 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.intensity === 0) return;

        const width = canvas.width;
        const height = canvas.height;
        const intensity = params.intensity / 100;
        const scale = params.scale;
        const seed = params.seed;

        // Seeded random for reproducibility
        const seededRandom = (s: number) => {
          const x = Math.sin(s * 12.9898 + seed * 78.233) * 43758.5453;
          return x - Math.floor(x);
        };

        // Generate Perlin-like noise for smooth wrinkle patterns
        const noise = (x: number, y: number, freq: number): number => {
          const ix = Math.floor(x * freq);
          const iy = Math.floor(y * freq);
          const fx = (x * freq) - ix;
          const fy = (y * freq) - iy;

          // Smooth interpolation
          const sx = fx * fx * (3 - 2 * fx);
          const sy = fy * fy * (3 - 2 * fy);

          // Corner values
          const n00 = seededRandom(ix + iy * 57);
          const n10 = seededRandom(ix + 1 + iy * 57);
          const n01 = seededRandom(ix + (iy + 1) * 57);
          const n11 = seededRandom(ix + 1 + (iy + 1) * 57);

          // Bilinear interpolation
          const nx0 = n00 * (1 - sx) + n10 * sx;
          const nx1 = n01 * (1 - sx) + n11 * sx;
          return nx0 * (1 - sy) + nx1 * sy;
        };

        // Multi-octave noise for more natural look
        const fbm = (x: number, y: number): number => {
          let value = 0;
          let amplitude = 1;
          let frequency = 1 / scale;
          let maxValue = 0;

          for (let i = 0; i < 4; i++) {
            value += amplitude * noise(x, y, frequency);
            maxValue += amplitude;
            amplitude *= 0.5;
            frequency *= 2;
          }

          return value / maxValue;
        };

        // Create wrinkle texture overlay
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext("2d")!;
        const imageData = tempCtx.createImageData(width, height);
        const data = imageData.data;

        // Light direction (top-left)
        const lightAngle = Math.PI * 0.75;
        const lightX = Math.cos(lightAngle);
        const lightY = Math.sin(lightAngle);

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;

            // Get height values for normal calculation
            const h = fbm(x, y);
            const hx = fbm(x + 1, y);
            const hy = fbm(x, y + 1);

            // Calculate surface normal (gradient)
            const dx = (hx - h) * 2;
            const dy = (hy - h) * 2;

            // Dot product with light direction for shading
            const shade = dx * lightX + dy * lightY;

            // Create crease lines at low points in the noise
            const crease = Math.max(0, 0.3 - h) * 3;

            // Combine shading: highlights and shadows from surface angle
            let brightness = 128;
            brightness += shade * 60 * intensity; // Surface shading
            brightness -= crease * 40 * intensity; // Crease darkening

            // Add subtle highlight on ridges
            if (h > 0.6) {
              brightness += (h - 0.6) * 80 * intensity;
            }

            // Clamp and set pixel
            brightness = Math.max(0, Math.min(255, brightness));

            // Store as grayscale with alpha based on deviation from mid-gray
            const deviation = Math.abs(brightness - 128);
            const alpha = Math.min(255, deviation * 2 * intensity);

            if (brightness > 128) {
              // Highlight
              data[idx] = 255;
              data[idx + 1] = 255;
              data[idx + 2] = 255;
              data[idx + 3] = (brightness - 128) * 2 * intensity;
            } else {
              // Shadow
              data[idx] = 0;
              data[idx + 1] = 0;
              data[idx + 2] = 0;
              data[idx + 3] = (128 - brightness) * 2 * intensity;
            }
          }
        }

        tempCtx.putImageData(imageData, 0, 0);

        // Apply blur for softer effect
        ctx.save();
        ctx.filter = "blur(1px)";
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(tempCanvas, 0, 0);
        ctx.filter = "none";
        ctx.restore();
      },
    },
    {
      id: "crumpledPaper",
      name: "Crumpled Paper",
      params: [
        { name: "intensity", type: "range", min: 0, max: 100, step: 5, default: 0 },
        { name: "crumpleSize", type: "range", min: 30, max: 100, step: 10, default: 50 },
        { name: "sharpness", type: "range", min: 1, max: 10, step: 1, default: 5 },
        { name: "seed", type: "range", min: 1, max: 100, step: 1, default: 42 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.intensity === 0) return;

        const width = canvas.width;
        const height = canvas.height;
        const intensity = params.intensity / 100;
        const crumpleSize = params.crumpleSize;
        const sharpness = params.sharpness;
        const seed = params.seed;

        // Seeded random
        const seededRandom = (s: number) => {
          const x = Math.sin(s * 12.9898 + seed * 78.233) * 43758.5453;
          return x - Math.floor(x);
        };

        // Voronoi-based crumple pattern for angular facets
        const numPoints = Math.floor((width * height) / (crumpleSize * crumpleSize * 4));
        const points: { x: number; y: number; h: number }[] = [];

        for (let i = 0; i < numPoints; i++) {
          points.push({
            x: seededRandom(i * 2) * width,
            y: seededRandom(i * 2 + 1) * height,
            h: seededRandom(i * 2 + 2), // Height value for this cell
          });
        }

        // Create overlay
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext("2d")!;
        const imageData = tempCtx.createImageData(width, height);
        const data = imageData.data;

        // Precompute closest point for each pixel (with caching for performance)
        const gridSize = Math.max(crumpleSize, 20);
        const gridW = Math.ceil(width / gridSize);
        const gridH = Math.ceil(height / gridSize);
        const grid: number[][] = Array(gridW * gridH).fill(null).map(() => []);

        // Assign points to grid cells
        points.forEach((p, i) => {
          const gx = Math.min(gridW - 1, Math.floor(p.x / gridSize));
          const gy = Math.min(gridH - 1, Math.floor(p.y / gridSize));
          grid[gy * gridW + gx].push(i);
        });

        const findClosestPoints = (x: number, y: number): { dist1: number; dist2: number; p1: typeof points[0]; p2: typeof points[0] } => {
          const gx = Math.min(gridW - 1, Math.floor(x / gridSize));
          const gy = Math.min(gridH - 1, Math.floor(y / gridSize));

          let minDist1 = Infinity;
          let minDist2 = Infinity;
          let closest1 = points[0];
          let closest2 = points[1];

          // Check 3x3 neighborhood
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const nx = gx + dx;
              const ny = gy + dy;
              if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) continue;

              const cell = grid[ny * gridW + nx];
              for (const idx of cell) {
                const p = points[idx];
                const dist = Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2);
                if (dist < minDist1) {
                  minDist2 = minDist1;
                  closest2 = closest1;
                  minDist1 = dist;
                  closest1 = p;
                } else if (dist < minDist2) {
                  minDist2 = dist;
                  closest2 = p;
                }
              }
            }
          }

          return { dist1: minDist1, dist2: minDist2, p1: closest1, p2: closest2 };
        };

        // Light direction
        const lightAngle = Math.PI * 0.75;
        const lightX = Math.cos(lightAngle);
        const lightY = Math.sin(lightAngle);

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;

            const { dist1, dist2, p1, p2 } = findClosestPoints(x, y);

            // Edge detection (border between cells)
            const edgeDist = Math.abs(dist1 - dist2);
            const edgeFactor = Math.exp(-edgeDist * sharpness / crumpleSize);

            // Height based on cell
            const cellHeight = p1.h;

            // Calculate gradient for shading
            const { p1: p1x } = findClosestPoints(x + 2, y);
            const { p1: p1y } = findClosestPoints(x, y + 2);
            const dx = p1x.h - cellHeight;
            const dy = p1y.h - cellHeight;

            // Lighting
            const shade = (dx * lightX + dy * lightY) * 0.5;

            // Crease darkness at edges
            const creaseDark = edgeFactor * 0.4;

            // Final brightness
            let brightness = 128;
            brightness += shade * 100 * intensity;
            brightness -= creaseDark * 100 * intensity;

            // Clamp
            brightness = Math.max(0, Math.min(255, brightness));

            if (brightness > 128) {
              data[idx] = 255;
              data[idx + 1] = 255;
              data[idx + 2] = 255;
              data[idx + 3] = (brightness - 128) * 2 * intensity;
            } else {
              data[idx] = 0;
              data[idx + 1] = 0;
              data[idx + 2] = 0;
              data[idx + 3] = (128 - brightness) * 1.5 * intensity;
            }
          }
        }

        tempCtx.putImageData(imageData, 0, 0);

        // Soft blur for realism
        ctx.save();
        ctx.filter = "blur(0.5px)";
        ctx.drawImage(tempCanvas, 0, 0);
        ctx.filter = "none";
        ctx.restore();
      },
    },
    {
      id: "waterDamage",
      name: "Water Damage",
      params: [
        { name: "intensity", type: "range", min: 0, max: 50, step: 5, default: 0 },
        { name: "blotchCount", type: "range", min: 1, max: 5, step: 1, default: 2 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.intensity === 0) return;

        const intensity = params.intensity / 100;

        for (let i = 0; i < params.blotchCount; i++) {
          const x = Math.random() * canvas.width;
          const y = Math.random() * canvas.height;
          const size = 80 + Math.random() * 180;

          const gradient = ctx.createRadialGradient(x, y, 0, x, y, size * 1.3);
          gradient.addColorStop(0, `rgba(190, 175, 155, ${intensity * 0.25})`);
          gradient.addColorStop(0.4, `rgba(185, 165, 145, ${intensity * 0.15})`);
          gradient.addColorStop(0.7, `rgba(175, 155, 135, ${intensity * 0.08})`);
          gradient.addColorStop(1, "rgba(170, 150, 130, 0)");

          ctx.fillStyle = gradient;
          ctx.beginPath();
          for (let a = 0; a < Math.PI * 2; a += 0.15) {
            const r = size * (0.7 + Math.random() * 0.5);
            const px = x + Math.cos(a) * r;
            const py = y + Math.sin(a) * r;
            if (a === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();

          for (let pass = 0; pass < 3; pass++) {
            const passSize = size * (0.95 + pass * 0.05);
            const passOpacity = intensity * (0.12 - pass * 0.03);
            const passWidth = 6 - pass * 1.5;

            ctx.strokeStyle = `rgba(130, 110, 90, ${passOpacity})`;
            ctx.lineWidth = passWidth;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.beginPath();
            for (let a = 0; a < Math.PI * 2; a += 0.12) {
              const r = passSize * (0.75 + Math.random() * 0.35);
              const px = x + Math.cos(a) * r;
              const py = y + Math.sin(a) * r;
              if (a === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.stroke();
          }
        }
      },
    },
    {
      id: "fingerprints",
      name: "Fingerprint Smudges",
      params: [
        { name: "count", type: "range", min: 0, max: 5, step: 1, default: 0 },
        { name: "opacity", type: "range", min: 10, max: 40, step: 5, default: 20 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.count === 0) return;

        for (let i = 0; i < params.count; i++) {
          const x = Math.random() * canvas.width;
          const y = Math.random() * canvas.height;
          const size = 40 + Math.random() * 50;
          const opacity = params.opacity / 100;

          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(Math.random() * Math.PI);

          for (let layer = 0; layer < 4; layer++) {
            const layerSize = size * (1 + layer * 0.15);
            const layerOpacity = opacity / (layer + 1);

            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, layerSize);
            gradient.addColorStop(0, `rgba(170, 150, 130, ${layerOpacity * 0.6})`);
            gradient.addColorStop(0.4, `rgba(175, 155, 135, ${layerOpacity * 0.4})`);
            gradient.addColorStop(0.7, `rgba(180, 160, 140, ${layerOpacity * 0.2})`);
            gradient.addColorStop(1, "rgba(180, 160, 140, 0)");

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.ellipse(layer * 2, layer * 3, layerSize, layerSize * 1.4, 0, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.strokeStyle = `rgba(140, 120, 100, ${opacity * 0.15})`;
          ctx.lineWidth = 1.5;
          for (let r = 8; r < size * 0.7; r += 6) {
            ctx.beginPath();
            ctx.arc(0, 0, r, -Math.PI * 0.35, Math.PI * 0.35);
            ctx.stroke();
          }

          ctx.restore();
        }
      },
    },
    {
      id: "hairFibers",
      name: "Hair/Fibers",
      params: [
        { name: "count", type: "range", min: 0, max: 10, step: 1, default: 0 },
        { name: "type", type: "select", options: ["hair", "fiber"], default: "hair" },
      ],
      apply: (ctx, canvas, params) => {
        if (params.count === 0) return;

        for (let i = 0; i < params.count; i++) {
          const x = Math.random() * canvas.width;
          const y = Math.random() * canvas.height;
          const length = params.type === "hair" ? 80 + Math.random() * 120 : 20 + Math.random() * 40;
          const thickness = params.type === "hair" ? 1 : 0.5 + Math.random() * 1.5;

          ctx.strokeStyle = params.type === "hair" ? "rgba(50, 40, 30, 0.7)" : "rgba(200, 200, 200, 0.5)";
          ctx.lineWidth = thickness;
          ctx.lineCap = "round";

          ctx.beginPath();
          ctx.moveTo(x, y);

          let cx = x, cy = y;
          const angle = Math.random() * Math.PI * 2;
          const curvature = (Math.random() - 0.5) * 0.3;

          for (let t = 0; t < 10; t++) {
            const segLength = length / 10;
            const segAngle = angle + curvature * t + (Math.random() - 0.5) * 0.2;
            cx += Math.cos(segAngle) * segLength;
            cy += Math.sin(segAngle) * segLength;
            ctx.lineTo(cx, cy);
          }

          ctx.stroke();
        }
      },
    },
    {
      id: "tapeStrips",
      name: "Tape Strips",
      params: [
        { name: "count", type: "range", min: 0, max: 3, step: 1, default: 0 },
        { name: "width", type: "range", min: 15, max: 40, step: 5, default: 20 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.count === 0) return;

        for (let i = 0; i < params.count; i++) {
          const x = Math.random() * canvas.width * 0.8;
          const y = Math.random() * canvas.height * 0.8;
          const length = 80 + Math.random() * 150;
          const width = params.width;
          const angle = (Math.random() - 0.5) * 0.5;

          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(angle);

          ctx.fillStyle = "rgba(255, 255, 220, 0.4)";
          ctx.fillRect(0, 0, length, width);

          ctx.strokeStyle = "rgba(200, 200, 180, 0.5)";
          ctx.lineWidth = 1;
          ctx.strokeRect(0, 0, length, width);

          ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
          ctx.beginPath();
          ctx.moveTo(0, 1);
          ctx.lineTo(length, 1);
          ctx.stroke();

          ctx.restore();
        }
      },
    },
  ],
};

// =============================================================================
// Category H: Scanner/Camera Artifacts
// =============================================================================

const categoryH: Category = {
  id: "H",
  name: "Scanner/Camera Artifacts",
  phase: "IMAGE",
  effects: [
    {
      id: "bookCurvature",
      name: "Book Curvature",
      params: [
        { name: "curvature", type: "range", min: 0, max: 50, step: 5, default: 0 },
        { name: "side", type: "select", options: ["left", "right"], default: "left" },
      ],
      apply: (ctx, canvas, params) => {
        if (params.curvature === 0) return;

        const imageData = getImageData(ctx, canvas);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;
        const curve = params.curvature / 100;
        const isLeft = params.side === "left";

        const result = new Uint8ClampedArray(data.length);
        result.set(data);

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            let normX = isLeft ? x / width : (width - x) / width;
            const displacement = curve * 50 * Math.pow(normX, 2);
            const srcY = Math.round(y + displacement * (y / height - 0.5));

            if (srcY >= 0 && srcY < height) {
              const srcIdx = (srcY * width + x) * 4;
              const dstIdx = (y * width + x) * 4;
              result[dstIdx] = data[srcIdx];
              result[dstIdx + 1] = data[srcIdx + 1];
              result[dstIdx + 2] = data[srcIdx + 2];
              result[dstIdx + 3] = data[srcIdx + 3];
            }
          }
        }

        imageData.data.set(result);
        putImageData(ctx, imageData);

        const gradient = ctx.createLinearGradient(
          isLeft ? 0 : width, 0,
          isLeft ? width * curve : width * (1 - curve), 0
        );
        gradient.addColorStop(0, `rgba(0, 0, 0, ${curve * 0.5})`);
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
      },
    },
    {
      id: "bindingGutter",
      name: "Binding Gutter Shadow",
      params: [
        { name: "width", type: "range", min: 0, max: 100, step: 10, default: 0 },
        { name: "shadowStrength", type: "range", min: 20, max: 80, step: 10, default: 40 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.width === 0) return;

        const gutterWidth = params.width;
        const strength = params.shadowStrength / 100;

        const gradient = ctx.createLinearGradient(0, 0, gutterWidth, 0);
        gradient.addColorStop(0, `rgba(0, 0, 0, ${strength})`);
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, gutterWidth, canvas.height);

        ctx.strokeStyle = `rgba(0, 0, 0, ${strength})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(1, 0);
        ctx.lineTo(1, canvas.height);
        ctx.stroke();
      },
    },
    {
      id: "glassReflections",
      name: "Glass Reflections",
      params: [
        { name: "count", type: "range", min: 0, max: 3, step: 1, default: 0 },
        { name: "intensity", type: "range", min: 20, max: 60, step: 10, default: 30 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.count === 0) return;

        for (let i = 0; i < params.count; i++) {
          const x = canvas.width * 0.2 + Math.random() * canvas.width * 0.6;
          const y = canvas.height * 0.2 + Math.random() * canvas.height * 0.6;
          const size = 200 + Math.random() * 350;
          const intensity = params.intensity / 100;

          const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
          gradient.addColorStop(0, `rgba(255, 255, 255, ${intensity})`);
          gradient.addColorStop(0.2, `rgba(255, 255, 255, ${intensity * 0.7})`);
          gradient.addColorStop(0.5, `rgba(255, 255, 255, ${intensity * 0.3})`);
          gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      },
    },
    {
      id: "rgbMisalignment",
      name: "RGB Channel Misalignment",
      params: [
        { name: "offsetX", type: "range", min: 0, max: 2, step: 0.5, default: 0 },
        { name: "offsetY", type: "range", min: 0, max: 2, step: 0.5, default: 0 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.offsetX === 0 && params.offsetY === 0) return;

        const imageData = getImageData(ctx, canvas);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;
        const result = new Uint8ClampedArray(data.length);

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;

            const rx = Math.min(width - 1, x + params.offsetX);
            const ry = Math.min(height - 1, y + params.offsetY);
            const rIdx = (ry * width + rx) * 4;
            result[idx] = data[rIdx];

            result[idx + 1] = data[idx + 1];

            const bx = Math.max(0, x - params.offsetX);
            const by = Math.max(0, y - params.offsetY);
            const bIdx = (by * width + bx) * 4;
            result[idx + 2] = data[bIdx + 2];

            result[idx + 3] = data[idx + 3];
          }
        }

        imageData.data.set(result);
        putImageData(ctx, imageData);
      },
    },
  ],
};

// =============================================================================
// Category K: Compression and Conversion
// =============================================================================

const categoryK: Category = {
  id: "K",
  name: "Compression and Conversion",
  phase: "IMAGE",
  effects: [
    {
      id: "posterization",
      name: "Quantization / Posterization",
      params: [
        { name: "levels", type: "range", min: 2, max: 32, step: 2, default: 32 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.levels >= 32) return;

        const imageData = getImageData(ctx, canvas);
        const data = imageData.data;
        const levels = params.levels;
        const step = 255 / (levels - 1);

        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.round(data[i] / step) * step;
          data[i + 1] = Math.round(data[i + 1] / step) * step;
          data[i + 2] = Math.round(data[i + 2] / step) * step;
        }

        putImageData(ctx, imageData);
      },
    },
    {
      id: "faxMode",
      name: "Fax Mode Degradation",
      params: [
        { name: "enabled", type: "checkbox", default: false },
        { name: "quality", type: "select", options: ["standard", "fine", "superfine"], default: "standard" },
      ],
      apply: (ctx, canvas, params) => {
        if (!params.enabled) return;

        const imageData = getImageData(ctx, canvas);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;

        const scanLineStep = params.quality === "superfine" ? 2 : params.quality === "fine" ? 3 : 4;

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const gray = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;

            const threshold = 128 + ((x % 2) * 32 - 16) + ((y % scanLineStep) * 16 - 8);
            const val = gray > threshold ? 255 : 0;

            data[idx] = val;
            data[idx + 1] = val;
            data[idx + 2] = val;
          }
        }

        for (let y = 0; y < height; y += scanLineStep) {
          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            data[idx] = Math.max(0, data[idx] - 20);
            data[idx + 1] = Math.max(0, data[idx + 1] - 20);
            data[idx + 2] = Math.max(0, data[idx + 2] - 20);
          }
        }

        putImageData(ctx, imageData);
      },
    },
    {
      id: "colorSpaceConversion",
      name: "Color Space Conversion Artifacts",
      params: [
        { name: "mode", type: "select", options: ["none", "rgb-cmyk-rgb", "srgb-adobe", "8bit-reduction"], default: "none" },
      ],
      apply: (ctx, canvas, params) => {
        if (params.mode === "none") return;

        const imageData = getImageData(ctx, canvas);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          let r = data[i];
          let g = data[i + 1];
          let b = data[i + 2];

          if (params.mode === "rgb-cmyk-rgb") {
            const k = 1 - Math.max(r, g, b) / 255;
            const c = k < 1 ? (1 - r / 255 - k) / (1 - k) : 0;
            const m = k < 1 ? (1 - g / 255 - k) / (1 - k) : 0;
            const y = k < 1 ? (1 - b / 255 - k) / (1 - k) : 0;

            r = Math.round(255 * (1 - c) * (1 - k) * 0.98);
            g = Math.round(255 * (1 - m) * (1 - k) * 0.98);
            b = Math.round(255 * (1 - y) * (1 - k) * 0.98);
          } else if (params.mode === "srgb-adobe") {
            r = Math.min(255, Math.round(r * 1.05));
            g = Math.min(255, Math.round(g * 0.97));
            b = Math.min(255, Math.round(b * 0.95));
          } else if (params.mode === "8bit-reduction") {
            r = Math.round(r / 8) * 8;
            g = Math.round(g / 8) * 8;
            b = Math.round(b / 8) * 8;
          }

          data[i] = Math.max(0, Math.min(255, r));
          data[i + 1] = Math.max(0, Math.min(255, g));
          data[i + 2] = Math.max(0, Math.min(255, b));
        }

        putImageData(ctx, imageData);
      },
    },
    {
      id: "paletteConversion",
      name: "Palette / Indexed Color Conversion",
      params: [
        { name: "colors", type: "range", min: 6, max: 256, step: 2, default: 256 },
      ],
      apply: (ctx, canvas, params) => {
        if (params.colors >= 256) return;

        const imageData = getImageData(ctx, canvas);
        const data = imageData.data;
        const numColors = params.colors;

        const step = Math.ceil(256 / Math.cbrt(numColors));

        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.round(data[i] / step) * step;
          data[i + 1] = Math.round(data[i + 1] / step) * step;
          data[i + 2] = Math.round(data[i + 2] / step) * step;
        }

        putImageData(ctx, imageData);
      },
    },
    {
      id: "webSafeColors",
      name: "Web-Safe Color Palette",
      params: [
        { name: "enabled", type: "checkbox", default: false },
      ],
      apply: (ctx, canvas, params) => {
        if (!params.enabled) return;

        const imageData = getImageData(ctx, canvas);
        const data = imageData.data;

        const webSafe = [0, 51, 102, 153, 204, 255];

        for (let i = 0; i < data.length; i += 4) {
          data[i] = webSafe.reduce((prev, curr) =>
            Math.abs(curr - data[i]) < Math.abs(prev - data[i]) ? curr : prev
          );
          data[i + 1] = webSafe.reduce((prev, curr) =>
            Math.abs(curr - data[i + 1]) < Math.abs(prev - data[i + 1]) ? curr : prev
          );
          data[i + 2] = webSafe.reduce((prev, curr) =>
            Math.abs(curr - data[i + 2]) < Math.abs(prev - data[i + 2]) ? curr : prev
          );
        }

        putImageData(ctx, imageData);
      },
    },
    {
      id: "resizeArtifacts",
      name: "Resize / Upscale Artifacts",
      params: [
        { name: "factor", type: "range", min: 1, max: 1.2, step: 0.05, default: 1 },
        { name: "method", type: "select", options: ["nearest", "bilinear"], default: "nearest" },
      ],
      apply: (ctx, canvas, params) => {
        if (params.factor <= 1) return;

        const width = canvas.width;
        const height = canvas.height;

        const imageData = getImageData(ctx, canvas);
        const origData = new Uint8ClampedArray(imageData.data);

        const scaleFactor = params.factor;
        const smallWidth = Math.floor(width / scaleFactor);
        const smallHeight = Math.floor(height / scaleFactor);

        if (params.method === "nearest") {
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const srcX = Math.floor((x / width) * smallWidth);
              const srcY = Math.floor((y / height) * smallHeight);
              const origX = Math.floor(srcX * scaleFactor);
              const origY = Math.floor(srcY * scaleFactor);

              const srcIdx = (Math.min(origY, height - 1) * width + Math.min(origX, width - 1)) * 4;
              const dstIdx = (y * width + x) * 4;

              imageData.data[dstIdx] = origData[srcIdx];
              imageData.data[dstIdx + 1] = origData[srcIdx + 1];
              imageData.data[dstIdx + 2] = origData[srcIdx + 2];
              imageData.data[dstIdx + 3] = origData[srcIdx + 3];
            }
          }
        } else {
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const srcX = (x / width) * smallWidth;
              const srcY = (y / height) * smallHeight;
              const origX = srcX * scaleFactor;
              const origY = srcY * scaleFactor;

              const x1 = Math.floor(origX);
              const y1 = Math.floor(origY);
              const x2 = Math.min(x1 + Math.ceil(scaleFactor), width - 1);
              const y2 = Math.min(y1 + Math.ceil(scaleFactor), height - 1);

              let r = 0, g = 0, b = 0, count = 0;
              for (let py = y1; py <= y2; py++) {
                for (let px = x1; px <= x2; px++) {
                  const idx = (py * width + px) * 4;
                  r += origData[idx];
                  g += origData[idx + 1];
                  b += origData[idx + 2];
                  count++;
                }
              }

              const dstIdx = (y * width + x) * 4;
              imageData.data[dstIdx] = Math.round(r / count);
              imageData.data[dstIdx + 1] = Math.round(g / count);
              imageData.data[dstIdx + 2] = Math.round(b / count);
            }
          }
        }

        putImageData(ctx, imageData);
      },
    },
  ],
};

// =============================================================================
// Category L: Occlusions and Foreign Objects
// =============================================================================

const categoryL: Category = {
  id: "L",
  name: "Occlusions and Foreign Objects",
  phase: "IMAGE",
  effects: [
    {
      id: "stickyNote",
      name: "Sticky Note Covering Content",
      params: [
        { name: "enabled", type: "checkbox", default: false },
        { name: "color", type: "select", options: ["yellow", "pink", "blue", "green"], default: "yellow" },
      ],
      apply: (ctx, canvas, params) => {
        if (!params.enabled) return;

        const colors: Record<string, string> = {
          yellow: "#fff740",
          pink: "#ff7eb9",
          blue: "#7afcff",
          green: "#7eff7a",
        };

        const size = 80 + Math.random() * 40;
        const x = canvas.width * 0.3 + Math.random() * canvas.width * 0.4;
        const y = canvas.height * 0.3 + Math.random() * canvas.height * 0.4;

        ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
        ctx.fillRect(x + 3, y + 3, size, size);

        ctx.fillStyle = colors[params.color] || colors.yellow;
        ctx.fillRect(x, y, size, size);

        ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
        ctx.beginPath();
        ctx.moveTo(x + size - 15, y + size);
        ctx.lineTo(x + size, y + size);
        ctx.lineTo(x + size, y + size - 15);
        ctx.fill();
      },
    },
    {
      id: "fingerInFrame",
      name: "Finger in Frame",
      params: [
        { name: "enabled", type: "checkbox", default: false },
        { name: "position", type: "select", options: ["top-left", "top-right", "bottom-left", "bottom-right"], default: "bottom-right" },
      ],
      apply: (ctx, canvas, params) => {
        if (!params.enabled) return;

        ctx.save();

        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 60);
        gradient.addColorStop(0, "#e8beac");
        gradient.addColorStop(0.7, "#d4a090");
        gradient.addColorStop(1, "#c08070");

        let x: number, y: number, rotation: number;

        switch (params.position) {
          case "top-left":
            x = -10;
            y = -10;
            rotation = Math.PI / 4;
            break;
          case "top-right":
            x = canvas.width + 10;
            y = -10;
            rotation = (3 * Math.PI) / 4;
            break;
          case "bottom-left":
            x = -10;
            y = canvas.height + 10;
            rotation = -Math.PI / 4;
            break;
          default:
            x = canvas.width + 10;
            y = canvas.height + 10;
            rotation = (-3 * Math.PI) / 4;
        }

        ctx.translate(x, y);
        ctx.rotate(rotation);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(0, 0, 25, 50, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#f0d0c0";
        ctx.beginPath();
        ctx.ellipse(0, -35, 12, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      },
    },
    {
      id: "penInFrame",
      name: "Pen / Ruler in Frame",
      params: [
        { name: "object", type: "select", options: ["none", "pen", "ruler", "pencil"], default: "none" },
      ],
      apply: (ctx, canvas, params) => {
        if (params.object === "none") return;

        ctx.save();

        const startX = canvas.width * 0.6;
        const startY = -20;
        const angle = Math.PI / 6;

        ctx.translate(startX, startY);
        ctx.rotate(angle);

        if (params.object === "pen") {
          ctx.fillStyle = "#1a1a1a";
          ctx.fillRect(-5, 0, 10, 200);

          ctx.fillStyle = "#c0c0c0";
          ctx.fillRect(-7, 10, 3, 40);

          ctx.fillStyle = "#c0c0c0";
          ctx.beginPath();
          ctx.moveTo(-5, 200);
          ctx.lineTo(5, 200);
          ctx.lineTo(0, 220);
          ctx.fill();
        } else if (params.object === "ruler") {
          ctx.fillStyle = "#f5deb3";
          ctx.fillRect(-15, 0, 30, 250);

          ctx.fillStyle = "#333";
          ctx.font = "8px Arial";
          for (let i = 0; i < 25; i++) {
            const markY = i * 10;
            const markWidth = i % 10 === 0 ? 10 : i % 5 === 0 ? 7 : 4;
            ctx.fillRect(-15, markY, markWidth, 1);
            if (i % 10 === 0) {
              ctx.fillText(String(i / 10), -12, markY + 10);
            }
          }

          ctx.strokeStyle = "#8b4513";
          ctx.lineWidth = 2;
          ctx.strokeRect(-15, 0, 30, 250);
        } else if (params.object === "pencil") {
          ctx.fillStyle = "#ffd700";
          ctx.fillRect(-4, 0, 8, 180);

          ctx.fillStyle = "#ff69b4";
          ctx.fillRect(-4, -15, 8, 15);

          ctx.fillStyle = "#c0c0c0";
          ctx.fillRect(-5, -3, 10, 6);

          ctx.fillStyle = "#f5deb3";
          ctx.beginPath();
          ctx.moveTo(-4, 180);
          ctx.lineTo(4, 180);
          ctx.lineTo(0, 200);
          ctx.fill();

          ctx.fillStyle = "#333";
          ctx.beginPath();
          ctx.moveTo(-1, 195);
          ctx.lineTo(1, 195);
          ctx.lineTo(0, 200);
          ctx.fill();
        }

        ctx.restore();
      },
    },
    {
      id: "binderClip",
      name: "Binder Clip on Document",
      params: [
        { name: "enabled", type: "checkbox", default: false },
        { name: "position", type: "select", options: ["top-center", "top-left", "top-right"], default: "top-center" },
      ],
      apply: (ctx, canvas, params) => {
        if (!params.enabled) return;

        ctx.save();

        let x: number;
        switch (params.position) {
          case "top-left":
            x = canvas.width * 0.2;
            break;
          case "top-right":
            x = canvas.width * 0.8;
            break;
          default:
            x = canvas.width * 0.5;
        }
        const y = 0;

        ctx.translate(x, y);

        ctx.strokeStyle = "#333";
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.moveTo(-15, 10);
        ctx.quadraticCurveTo(-25, 0, -20, -15);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(15, 10);
        ctx.quadraticCurveTo(25, 0, 20, -15);
        ctx.stroke();

        ctx.fillStyle = "#1a1a1a";
        ctx.beginPath();
        ctx.roundRect(-20, 5, 40, 30, 3);
        ctx.fill();

        ctx.fillStyle = "#333";
        ctx.fillRect(-18, 8, 36, 3);

        ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
        ctx.fillRect(-22, 35, 44, 5);

        ctx.restore();
      },
    },
  ],
};

// =============================================================================
// All Categories
// =============================================================================

export const CATEGORIES: Category[] = [
  categoryA,
  categoryB,
  categoryC,
  categoryD,
  categoryE,
  categoryF,
  categoryH,
  categoryK,
  categoryL,
];

// =============================================================================
// Utility Functions
// =============================================================================

export function getEffectById(effectId: string): Effect | undefined {
  for (const cat of CATEGORIES) {
    const effect = cat.effects.find(e => e.id === effectId);
    if (effect) return effect;
  }
  return undefined;
}

export function getAllEffects(): Effect[] {
  return CATEGORIES.flatMap(cat => cat.effects);
}

export function applyEffect(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  effectId: string,
  params: Record<string, any>
): void {
  const effect = getEffectById(effectId);
  if (effect) {
    effect.apply(ctx, canvas, params);
  }
}

export function applyEffects(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  effectsConfig: Record<string, Record<string, any>>
): void {
  Object.entries(effectsConfig).forEach(([effectId, params]) => {
    applyEffect(ctx, canvas, effectId, params);
  });
}

export function applyEffectsToImage(
  image: HTMLImageElement,
  effectsConfig: Record<string, Record<string, any>>,
  outputFormat: 'image/png' | 'image/jpeg' = 'image/png',
  quality?: number
): string {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0);

  applyEffects(ctx, canvas, effectsConfig);

  return canvas.toDataURL(outputFormat, quality);
}

export function applyEffectsToImageUrl(
  imageUrl: string,
  effectsConfig: Record<string, Record<string, any>>,
  outputFormat: 'image/png' | 'image/jpeg' = 'image/png',
  quality?: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const result = applyEffectsToImage(img, effectsConfig, outputFormat, quality);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
}

export function getEffectDefaults(effectId: string): Record<string, any> {
  const effect = getEffectById(effectId);
  if (!effect) return {};

  const defaults: Record<string, any> = {};
  effect.params.forEach(p => {
    defaults[p.name] = p.default;
  });
  return defaults;
}

// Re-export helpers for use by other modules
export { getImageData, putImageData };
