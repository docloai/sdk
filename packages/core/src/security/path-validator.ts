/**
 * Path Validation and Path Traversal Prevention
 * Prevents attackers from accessing arbitrary files through path traversal
 */

import { resolve, normalize, isAbsolute, relative } from 'path';

/**
 * Validate and normalize a file path to prevent traversal attacks
 * @param filePath - The file path to validate
 * @param basePath - The base directory that paths must be within
 * @throws Error if path attempts to traverse outside basePath
 * @returns The normalized safe path
 */
export function validatePath(filePath: string, basePath: string): string {
  // Normalize both paths to handle . and .. references
  const normalizedBase = normalize(resolve(basePath));
  const normalizedPath = normalize(resolve(basePath, filePath));

  // Check if the resolved path is within the base path
  const relativePath = relative(normalizedBase, normalizedPath);

  // If relative path starts with .., it's trying to escape the base
  if (relativePath.startsWith('..')) {
    throw new Error(
      `Path traversal attempt detected: ${filePath} tries to escape ${basePath}`
    );
  }

  // Also check if it's an absolute path that's not based on basePath
  if (isAbsolute(filePath) && !normalizedPath.startsWith(normalizedBase)) {
    throw new Error(
      `Absolute path outside base directory: ${filePath} is not within ${basePath}`
    );
  }

  return normalizedPath;
}

/**
 * Validate a path without a required base path (more permissive)
 * Still prevents obvious traversal attempts
 * @param filePath - The file path to validate
 * @throws Error if path contains suspicious traversal patterns
 * @returns The normalized path
 */
export function validatePathSimple(filePath: string): string {
  const normalized = normalize(filePath);

  // Check for obvious traversal patterns
  if (normalized.includes('..') || normalized.startsWith('/etc') ||
      normalized.startsWith('C:\\Windows')) {
    throw new Error(`Suspicious path detected: ${filePath}`);
  }

  return normalized;
}

/**
 * Check if a path would be safe to access
 * @param filePath - The file path to check
 * @param basePath - Optional base path restriction
 * @returns true if path is safe, false otherwise
 */
export function isPathSafe(filePath: string, basePath?: string): boolean {
  try {
    if (basePath) {
      validatePath(filePath, basePath);
    } else {
      validatePathSimple(filePath);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the absolute path with validation
 * @param filePath - The file path
 * @param basePath - Optional base directory
 * @returns Absolute path if valid
 * @throws Error if path is invalid
 */
export function getSafePath(filePath: string, basePath?: string): string {
  if (basePath) {
    return validatePath(filePath, basePath);
  }
  return resolve(filePath);
}
