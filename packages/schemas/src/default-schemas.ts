/**
 * Default schemas that are automatically registered on package import
 */

import { registerSchema } from './schema-registry.js';
import bdnSchemaJSON from '../schemas/bdn.json' with { type: 'json' };

/**
 * Bunker Delivery Note (BDN) schema v1.0.0
 */
registerSchema({
  id: 'bdn',
  version: '1.0.0',
  schema: bdnSchemaJSON,
  description: 'Comprehensive schema for extracting data from Bunker Delivery Notes (BDN)',
  tags: ['maritime', 'fuel', 'compliance', 'MARPOL'],
  createdAt: '2024-10-25T00:00:00.000Z',
  updatedAt: '2024-10-25T00:00:00.000Z'
});
